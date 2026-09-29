//! Opt-in fixed Bing RSS endpoint. No redirects, challenges, or HTML fallback.
use super::FailureCode;
use metadata_search_engine_rs::models::SearchResult;
use quick_xml::{Reader, events::Event};
use reqwest::{Client, header};
use std::time::Duration;
use url::Url;

const ENDPOINT: &str = "https://www.bing.com/search";
const MAX_BODY: usize = 2 * 1024 * 1024;
const MAX_TEXT: usize = 16 * 1024;
type Outcome = Result<Vec<SearchResult>, FailureCode>;

pub async fn search(client: &Client, query: &str, limit: usize, timeout: Duration) -> Outcome {
    search_at(client, ENDPOINT, query, limit, timeout).await
}

async fn search_at(
    client: &Client,
    endpoint: &str,
    query: &str,
    limit: usize,
    timeout: Duration,
) -> Outcome {
    tokio::time::timeout(timeout, async {
        let mut response = client
            .get(endpoint)
            .query(&[("format", "rss"), ("q", query)])
            .send()
            .await
            .map_err(|error| super::transport_code(&error, FailureCode::Http))?;
        if !response.status().is_success() {
            return Err(super::status_code(response.status().as_u16()));
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        if !["application/rss+xml", "application/xml", "text/xml"]
            .iter()
            .any(|v| content_type.eq_ignore_ascii_case(v))
        {
            return Err(FailureCode::ContentType);
        }
        if response.headers().contains_key(header::CONTENT_ENCODING) {
            return Err(FailureCode::ContentEncoding);
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_BODY as u64)
        {
            return Err(FailureCode::BodyLimit);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| super::transport_code(&error, FailureCode::HttpBody))?
        {
            if chunk.len() > MAX_BODY.saturating_sub(body.len()) {
                return Err(FailureCode::BodyLimit);
            }
            body.extend_from_slice(&chunk);
        }
        parse(
            std::str::from_utf8(&body).map_err(|_| FailureCode::BodyEncoding)?,
            limit,
            query,
        )
    })
    .await
    .map_err(|_| FailureCode::Timeout)?
}

fn destination(raw: &str) -> Result<String, FailureCode> {
    let url = Url::parse(raw.trim()).map_err(|_| FailureCode::Parse)?;
    let host = url.host_str().ok_or(FailureCode::Parse)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || !host.contains('.')
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host
            .trim_matches(['[', ']'])
            .parse()
            .is_ok_and(super::is_private_or_reserved)
    {
        return Err(FailureCode::Parse);
    }
    Ok(url.into())
}

fn parse(xml: &str, limit: usize, expected_query: &str) -> Outcome {
    if xml.len() > MAX_BODY {
        return Err(FailureCode::BodyLimit);
    }
    if limit == 0 || limit > 20 {
        return Err(FailureCode::ResultLimit);
    }
    let mut reader = Reader::from_str(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut stack: Vec<String> = Vec::new();
    let mut roots = 0;
    let mut channels = 0;
    let mut items = 0;
    let mut title = String::new();
    let mut link = String::new();
    let mut snippet = String::new();
    let mut fields = std::collections::HashSet::new();
    let mut channel_title = String::new();
    let mut channel_link = String::new();
    let mut results = Vec::new();
    loop {
        match reader.read_event().map_err(|_| FailureCode::Parse)? {
            Event::Start(event) => {
                let name = event.name().as_ref().to_string();
                if name.len() > 128 || stack.len() >= 8 {
                    return Err(FailureCode::BodyLimit);
                }
                // Validate attribute syntax and reject duplicate attributes even on ignored metadata.
                let attributes: Vec<_> = event
                    .attributes()
                    .collect::<Result<_, _>>()
                    .map_err(|_| FailureCode::Parse)?;
                if attributes.len() > 32 {
                    return Err(FailureCode::BodyLimit);
                }
                if stack.is_empty() {
                    roots += 1;
                    if roots != 1
                        || name != "rss"
                        || !attributes
                            .iter()
                            .any(|a| a.key.as_ref() == "version" && a.value == "2.0")
                    {
                        return Err(FailureCode::Parse);
                    }
                } else if stack.len() == 1 {
                    if name != "channel" || channels != 0 {
                        return Err(FailureCode::Parse);
                    }
                    channels += 1;
                } else if stack.len() == 2 && name == "item" {
                    items += 1;
                    if items > 100 {
                        return Err(FailureCode::BodyLimit);
                    }
                    title.clear();
                    link.clear();
                    snippet.clear();
                    fields.clear();
                } else if stack.len() == 3
                    && stack[2] == "item"
                    && matches!(name.as_str(), "title" | "link" | "description")
                {
                    if !fields.insert(name.clone()) {
                        return Err(FailureCode::Parse);
                    }
                } else if stack.len() >= 4 && stack[2] == "item" {
                    return Err(FailureCode::Parse);
                }
                stack.push(name);
            }
            Event::End(_) => {
                if stack.len() == 3 && stack[2] == "item" {
                    if title.trim().is_empty() || link.trim().is_empty() {
                        return Err(FailureCode::Parse);
                    }
                    let url = destination(&link)?;
                    if results.len() < limit {
                        results.push(SearchResult {
                            title: title.split_whitespace().collect::<Vec<_>>().join(" "),
                            url,
                            snippet: if snippet.trim().is_empty() {
                                None
                            } else {
                                Some(snippet.split_whitespace().collect::<Vec<_>>().join(" "))
                            },
                            source_engine: "bing".into(),
                        });
                    }
                }
                if stack.pop().is_none() {
                    return Err(FailureCode::Parse);
                }
            }
            Event::Text(text) => append_text(
                text.as_ref(),
                &stack,
                &mut title,
                &mut link,
                &mut snippet,
                &mut channel_title,
                &mut channel_link,
            )?,
            Event::CData(text) => append_text(
                text.as_ref(),
                &stack,
                &mut title,
                &mut link,
                &mut snippet,
                &mut channel_title,
                &mut channel_link,
            )?,
            Event::GeneralRef(reference) => {
                let raw = format!("&{};", reference.as_ref());
                let decoded = quick_xml::escape::unescape(&raw).map_err(|_| FailureCode::Parse)?;
                append_text(
                    &decoded,
                    &stack,
                    &mut title,
                    &mut link,
                    &mut snippet,
                    &mut channel_title,
                    &mut channel_link,
                )?;
            }
            Event::DocType(_) | Event::PI(_) => return Err(FailureCode::Parse),
            Event::Decl(_) => {
                if roots != 0 {
                    return Err(FailureCode::Parse);
                }
            }
            Event::Comment(_) => {}
            Event::Eof => break,
            _ => return Err(FailureCode::Parse),
        }
    }
    if !stack.is_empty() || roots != 1 || channels != 1 || channel_title.trim().is_empty() {
        return Err(FailureCode::Parse);
    }
    let channel_url = Url::parse(channel_link.trim()).map_err(|_| FailureCode::Parse)?;
    if !matches!(channel_url.scheme(), "https" | "http")
        || channel_url.host_str() != Some("www.bing.com")
        || channel_url.path() != "/search"
        || !channel_url.username().is_empty()
        || channel_url.password().is_some()
    {
        return Err(FailureCode::Parse);
    }
    let queries: Vec<_> = channel_url
        .query_pairs()
        .filter(|(key, _)| key == "q")
        .collect();
    if queries.len() != 1 || queries[0].1 != expected_query {
        return Err(FailureCode::QueryMismatch);
    }
    // A complete, recognized RSS channel may legitimately contain zero items.
    Ok(results)
}

fn append_text(
    text: &str,
    stack: &[String],
    title: &mut String,
    link: &mut String,
    snippet: &mut String,
    channel_title: &mut String,
    channel_link: &mut String,
) -> Result<(), FailureCode> {
    if text.len() > MAX_TEXT {
        return Err(FailureCode::BodyLimit);
    }
    let target = if stack.len() == 4 && stack[2] == "item" {
        match stack[3].as_str() {
            "title" => Some(title),
            "link" => Some(link),
            "description" => Some(snippet),
            _ => None,
        }
    } else if stack.len() == 3 {
        match stack[2].as_str() {
            "title" => Some(channel_title),
            "link" => Some(channel_link),
            _ => None,
        }
    } else {
        None
    };
    if let Some(target) = target {
        if text.len() > MAX_TEXT.saturating_sub(target.len()) {
            return Err(FailureCode::BodyLimit);
        }
        target.push_str(text);
    } else if stack.len() < 2 && !text.trim().is_empty() {
        return Err(FailureCode::Parse);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parse(xml: &str, limit: usize) -> Outcome {
        super::parse(xml, limit, "public query")
    }
    fn rss(items: &str) -> String {
        format!(
            "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Public search</title><link>https://www.bing.com/search?q=public+query</link><description>Results</description>{items}</channel></rss>"
        )
    }
    fn item() -> &'static str {
        "<item><title>Useful &amp; public</title><link>https://example.com/article?a=1&amp;b=2</link><description><![CDATA[Useful evidence]]></description></item>"
    }
    #[test]
    fn parses_complete_rss_and_explicit_empty_channel() {
        let results = parse(&rss(item()), 3).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Useful & public");
        assert_eq!(results[0].url, "https://example.com/article?a=1&b=2");
        assert_eq!(results[0].source_engine, "bing");
        assert!(parse(&rss(""), 3).unwrap().is_empty());
        for limit in 1..=20 {
            assert_eq!(parse(&rss(&item().repeat(21)), limit).unwrap().len(), limit);
        }
    }
    #[test]
    fn rejects_non_rss_incomplete_entities_and_invalid_links() {
        for body in [
            "<html>Challenge</html>".into(),
            "<rss version=\"2.0\"><channel>".into(),
            rss(item()).replace("</rss>", ""),
            rss(item()).replace("</item>", "</wrong>"),
            rss(item()).replace("Useful &amp; public", "&unknown;"),
            rss(item()).replace(
                "<rss",
                "<!DOCTYPE rss [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><rss",
            ),
            rss(item()).replace(
                "https://example.com/article?a=1&amp;b=2",
                "http://127.0.0.1/private",
            ),
            rss(item()).replace(
                "https://example.com/article?a=1&amp;b=2",
                "javascript:alert(1)",
            ),
            rss(item()).replace(
                "https://example.com/article?a=1&amp;b=2",
                "https://user:secret@example.com/",
            ),
            rss(item()).replace("<title>Useful", "<title><b>Useful"),
            rss(item()).replace("</item>", "<link>https://example.com/other</link></item>"),
            format!("{}{}", rss(""), rss("")),
            rss("").replace("https://www.bing.com", "https://evil.invalid"),
        ] {
            assert!(parse(&body, 3).is_err(), "accepted {body}");
        }
    }
    #[test]
    fn rejects_missing_duplicate_and_mismatched_query_identity_even_when_empty() {
        for body in [rss(item()), rss("")] {
            assert_eq!(
                super::parse(&body, 3, "different query").unwrap_err(),
                FailureCode::QueryMismatch
            );
            assert_eq!(
                parse(&body.replace("?q=public+query", ""), 3).unwrap_err(),
                FailureCode::QueryMismatch
            );
            assert_eq!(
                parse(
                    &body.replace("?q=public+query", "?q=public+query&amp;q=public+query"),
                    3
                )
                .unwrap_err(),
                FailureCode::QueryMismatch
            );
        }
    }
    #[test]
    fn bounds_body_fields_depth_and_items() {
        assert_eq!(
            parse(&"x".repeat(MAX_BODY + 1), 3).unwrap_err(),
            FailureCode::BodyLimit
        );
        assert_eq!(
            parse(
                &rss(&item().replace("Useful &amp; public", &"x".repeat(MAX_TEXT + 1))),
                3
            )
            .unwrap_err(),
            FailureCode::BodyLimit
        );
        assert!(
            parse(
                &rss(&format!(
                    "{}{}",
                    "<nested>".repeat(10),
                    "</nested>".repeat(10)
                )),
                3
            )
            .is_err()
        );
        assert_eq!(
            parse(&rss(&item().repeat(101)), 3).unwrap_err(),
            FailureCode::BodyLimit
        );
    }
    #[tokio::test]
    async fn bounded_transport_accepts_rss_refuses_redirect_and_challenge() {
        use std::io::{Read, Write};
        for (status, content_type, body, expected) in [
            ("200 OK", "application/rss+xml", rss(item()), None),
            (
                "302 Found",
                "text/xml",
                String::new(),
                Some(FailureCode::HttpRedirect),
            ),
            (
                "429 Too Many Requests",
                "text/xml",
                String::new(),
                Some(FailureCode::HttpRateLimited),
            ),
            (
                "200 OK",
                "text/html",
                "<html>challenge</html>".into(),
                Some(FailureCode::ContentType),
            ),
            (
                "200 OK",
                "text/xml",
                "<rss>".into(),
                Some(FailureCode::Parse),
            ),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let deadline = std::time::Instant::now() + Duration::from_secs(3);
                let mut socket = loop {
                    match listener.accept() {
                        Ok((socket, _)) => break socket,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(std::time::Instant::now() < deadline);
                            std::thread::sleep(Duration::from_millis(2));
                        }
                        Err(error) => panic!("{error}"),
                    }
                };
                socket.set_nonblocking(false).unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                socket
                    .set_write_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut byte = [0];
                while !request.ends_with(b"\r\n\r\n") {
                    assert!(request.len() < 8192);
                    if socket.read(&mut byte).unwrap() == 0 {
                        break;
                    }
                    request.push(byte[0]);
                }
                assert!(
                    String::from_utf8(request)
                        .unwrap()
                        .starts_with("GET /search?format=rss&q=public+query ")
                );
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nLocation: http://127.0.0.1:1/\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes());
            });
            let client =
                super::super::build_pinned_http_client(&[], Duration::from_secs(2)).unwrap();
            let result = search_at(
                &client,
                &format!("http://{address}/search"),
                "public query",
                3,
                Duration::from_secs(2),
            )
            .await;
            server.join().unwrap();
            match expected {
                Some(code) => assert_eq!(result.unwrap_err(), code),
                None => assert_eq!(result.unwrap().len(), 1),
            }
        }
    }
}
