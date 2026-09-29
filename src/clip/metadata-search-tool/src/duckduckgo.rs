//! Bounded parsing of the fixed DuckDuckGo HTML endpoint. An unrecognized page
//! is unavailable evidence, never proof that a query has no results.
use super::FailureCode;
use std::time::Duration;

use metadata_search_engine_rs::models::SearchResult;
use reqwest::{Client, header};
use scraper::{Html, Selector};
use url::Url;

const ENDPOINT: &str = "https://html.duckduckgo.com/html/";
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

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
            .query(&[("q", query)])
            .send()
            .await
            .map_err(|error| super::transport_code(&error, FailureCode::Http))?;
        validate_response(
            response.status(),
            response.headers(),
            response.content_length(),
        )?;
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| super::transport_code(&error, FailureCode::HttpBody))?
        {
            append_body(&mut body, &chunk)?;
        }
        let html = std::str::from_utf8(&body).map_err(|_| FailureCode::BodyEncoding)?;
        parse(html, limit)
    })
    .await
    .map_err(|_| FailureCode::Timeout)?
}

fn validate_response(
    status: reqwest::StatusCode,
    headers: &header::HeaderMap,
    length: Option<u64>,
) -> Result<(), FailureCode> {
    if !status.is_success() {
        return Err(super::status_code(status.as_u16()));
    }
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim();
    if !content_type.eq_ignore_ascii_case("text/html")
        && !content_type.eq_ignore_ascii_case("application/xhtml+xml")
    {
        return Err(FailureCode::ContentType);
    }
    // reqwest removes this header after a supported decoding operation.
    if headers.get(header::CONTENT_ENCODING).is_some() {
        return Err(FailureCode::ContentEncoding);
    }
    if length.is_some_and(|length| length > MAX_BODY_BYTES as u64) {
        return Err(FailureCode::BodyLimit);
    }
    Ok(())
}

fn append_body(body: &mut Vec<u8>, chunk: &[u8]) -> Result<(), FailureCode> {
    if chunk.len() > MAX_BODY_BYTES.saturating_sub(body.len()) {
        return Err(FailureCode::BodyLimit);
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("static selector")
}

fn destination(href: &str) -> Option<String> {
    let endpoint = Url::parse(ENDPOINT).ok()?;
    let link = endpoint.join(href).ok()?;
    let is_wrapper = matches!(
        link.host_str(),
        Some("duckduckgo.com" | "www.duckduckgo.com" | "html.duckduckgo.com")
    ) && link.path() == "/l/";
    let destination = if is_wrapper {
        let values: Vec<_> = link
            .query_pairs()
            .filter(|(name, _)| name == "uddg")
            .collect();
        if values.len() != 1 {
            return None;
        }
        Url::parse(&values[0].1).ok()?
    } else {
        // Relative links to navigation are not organic destinations.
        if !href.starts_with("https://") && !href.starts_with("http://") {
            return None;
        }
        link
    };
    if !matches!(destination.scheme(), "http" | "https")
        || destination.host_str().is_none()
        || !destination.username().is_empty()
        || destination.password().is_some()
    {
        return None;
    }
    Some(destination.into())
}

fn parse(html: &str, limit: usize) -> Outcome {
    if html.len() > MAX_BODY_BYTES {
        return Err(FailureCode::BodyLimit);
    }
    if limit == 0 || limit > 20 {
        return Err(FailureCode::ResultLimit);
    }
    let document = Html::parse_document(html);
    if document
        .select(&selector(
            "#challenge-form, #anomaly-modal, .anomaly-modal, form[action*='anomaly.js']",
        ))
        .next()
        .is_some()
    {
        return Err(FailureCode::Challenge);
    }
    let result_selector = selector("div.result");
    let title_selector = selector("a.result__a");
    let snippet_selector = selector(".result__snippet");
    let mut results = Vec::new();
    let mut result_containers = 0;
    for element in document.select(&result_selector) {
        if element
            .value()
            .classes()
            .any(|class| class == "result--no-result")
        {
            continue;
        }
        result_containers += 1;
        let Some(title_element) = element.select(&title_selector).next() else {
            continue;
        };
        let title = title_element
            .text()
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let Some(url) = title_element.value().attr("href").and_then(destination) else {
            continue;
        };
        if title.is_empty() {
            continue;
        }
        let snippet = element
            .select(&snippet_selector)
            .next()
            .map(|element| {
                element
                    .text()
                    .collect::<String>()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|text| !text.is_empty());
        results.push(SearchResult {
            title,
            url,
            snippet,
            source_engine: "duckduckgo".to_string(),
        });
        if results.len() == limit {
            break;
        }
    }
    if !results.is_empty() {
        return Ok(results);
    }
    // The known no-results message is accepted only if there are no competing
    // organic result containers. Generic page prose is not a no-results marker.
    let no_results = document
        .select(&selector(".no-results, .result--no-result .result__body"))
        .any(|element| {
            element
                .text()
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .starts_with("No results found for")
        });
    if result_containers == 0 && no_results {
        Ok(Vec::new())
    } else {
        Err(FailureCode::UnrecognizedHtml)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(href: &str) -> String {
        format!(
            r#"<div class="result"><a class="result__a" href="{href}">Python <b>Tasks</b></a><a class="result__snippet">Read tasks.</a></div>"#
        )
    }

    #[test]
    fn parses_direct_and_redirect_results() {
        for href in [
            "https://docs.python.org/3/library/asyncio-task.html",
            "/l/?uddg=https%3A%2F%2Fdocs.python.org%2F3%2Flibrary%2Fasyncio-task.html",
            "//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.python.org%2F3%2Flibrary%2Fasyncio-task.html",
            "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.python.org%2F3%2Flibrary%2Fasyncio-task.html",
        ] {
            let results = parse(&result(href), 5).unwrap();
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].title, "Python Tasks");
            assert_eq!(
                results[0].url,
                "https://docs.python.org/3/library/asyncio-task.html"
            );
            assert_eq!(results[0].snippet.as_deref(), Some("Read tasks."));
        }
    }

    #[test]
    fn rejects_challenge_even_with_injected_results() {
        for marker in [
            "<form id='challenge-form'></form>",
            "<div class='anomaly-modal'></div>",
            "<form action='//duckduckgo.com/anomaly.js'></form>",
        ] {
            assert_eq!(
                parse(&format!("{marker}{}", result("https://example.org")), 5).unwrap_err(),
                FailureCode::Challenge
            );
        }
    }

    #[test]
    fn only_explicit_no_results_is_empty_success() {
        assert!(
            parse(
                "<div class='no-results'>No results found for <b>query</b></div>",
                5
            )
            .unwrap()
            .is_empty()
        );
        for html in [
            "",
            "<html>Consent required</html>",
            "<p>No results found for query</p>",
            "<div class='no-results'>changed markup</div>",
            "<div class='result'><h2>unrecognized</h2></div>",
            "<div class='no-results'>No results found for query</div><div class='result'></div>",
        ] {
            assert_eq!(parse(html, 5).unwrap_err(), FailureCode::UnrecognizedHtml);
        }
    }

    #[test]
    fn rejects_invalid_destinations() {
        for href in [
            "javascript:alert(1)",
            "https://user:secret@example.org",
            "/settings",
            "/l/?uddg=javascript%3Aalert(1)",
            "/l/?uddg=https%3A%2F%2Fa.org&uddg=https%3A%2F%2Fb.org",
        ] {
            assert!(destination(href).is_none(), "{href}");
            assert_eq!(
                parse(&result(href), 5).unwrap_err(),
                FailureCode::UnrecognizedHtml
            );
        }
    }

    #[test]
    fn enforces_result_and_body_limits() {
        assert_eq!(
            parse(&result("https://example.org").repeat(5), 2)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(parse("", 0).unwrap_err(), FailureCode::ResultLimit);
        assert_eq!(parse("", 21).unwrap_err(), FailureCode::ResultLimit);
        let mut bytes = vec![0; MAX_BODY_BYTES - 1];
        append_body(&mut bytes, &[0]).unwrap();
        assert_eq!(
            append_body(&mut bytes, &[1]).unwrap_err(),
            FailureCode::BodyLimit
        );
        assert_eq!(bytes.len(), MAX_BODY_BYTES);
        assert_eq!(
            parse(&"x".repeat(MAX_BODY_BYTES + 1), 1).unwrap_err(),
            FailureCode::BodyLimit
        );
    }
    #[test]
    fn validates_http_metadata_before_reading() {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("text/html; charset=utf-8"),
        );
        assert!(validate_response(reqwest::StatusCode::OK, &headers, None).is_ok());
        for status in [302, 403, 429, 500] {
            assert_eq!(
                validate_response(
                    reqwest::StatusCode::from_u16(status).unwrap(),
                    &headers,
                    None
                ),
                Err(super::super::status_code(status))
            );
        }
        assert_eq!(
            validate_response(
                reqwest::StatusCode::OK,
                &headers,
                Some(MAX_BODY_BYTES as u64 + 1)
            ),
            Err(FailureCode::BodyLimit)
        );
        headers.insert(
            header::CONTENT_ENCODING,
            header::HeaderValue::from_static("deflate"),
        );
        assert_eq!(
            validate_response(reqwest::StatusCode::OK, &headers, None),
            Err(FailureCode::ContentEncoding)
        );
        headers.remove(header::CONTENT_ENCODING);
        headers.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json"),
        );
        assert_eq!(
            validate_response(reqwest::StatusCode::OK, &headers, None),
            Err(FailureCode::ContentType)
        );
    }

    #[test]
    fn result_limits_preserve_prefix_and_destination_roundtrips() {
        for count in 1..=25 {
            let urls: Vec<_> = (0..count)
                .map(|index| format!("https://example.org/path/{index}?a=one%20two&b=%26"))
                .collect();
            let html = urls
                .iter()
                .map(|url| {
                    let mut wrapper = Url::parse("https://duckduckgo.com/l/").unwrap();
                    wrapper.query_pairs_mut().append_pair("uddg", url);
                    result(wrapper.as_str())
                })
                .collect::<String>();
            for limit in 1..=20 {
                let parsed = parse(&html, limit).unwrap();
                assert_eq!(parsed.len(), count.min(limit));
                assert_eq!(
                    parsed.iter().map(|item| &item.url).collect::<Vec<_>>(),
                    urls.iter().take(limit).collect::<Vec<_>>()
                );
            }
        }
    }
    fn fixture(
        status: &str,
        headers: &str,
        body: Vec<u8>,
        body_delay: Duration,
    ) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/html/", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n",
            body.len()
        );
        let handle = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(3);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            std::time::Instant::now() < deadline,
                            "fixture accept timeout"
                        );
                        std::thread::sleep(Duration::from_millis(2));
                    }
                    Err(error) => panic!("fixture accept: {error}"),
                }
            };
            // macOS may inherit the listener nonblocking flag on accept.
            // Use the explicit bounded read/write timeouts for fixture I/O.
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            stream
                .set_write_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut byte = [0];
            while !request.ends_with(b"\r\n\r\n") {
                assert!(request.len() < 16 * 1024);
                if stream.read(&mut byte).unwrap() == 0 {
                    break;
                }
                request.push(byte[0]);
            }
            let _ = stream.write_all(response.as_bytes());
            std::thread::sleep(body_delay);
            let _ = stream.write_all(&body);
            String::from_utf8(request).unwrap()
        });
        (url, handle)
    }

    fn client() -> Client {
        // Exercise the actual production header/decoder setup. The fixture
        // address is explicit; no production DNS/private-address policy changes.
        super::super::build_pinned_http_client(&[], Duration::from_secs(2)).unwrap()
    }

    #[tokio::test]
    async fn transport_uses_supported_encodings_and_parses_html() {
        let (url, server) = fixture(
            "200 OK",
            "Content-Type: text/html\r\n",
            result("https://example.org/docs").into_bytes(),
            Duration::ZERO,
        );
        let outcome = search_at(
            &client(),
            &url,
            "two words + plus",
            5,
            Duration::from_secs(2),
        )
        .await;
        let request = server.join().unwrap().to_ascii_lowercase();
        assert_eq!(outcome.unwrap().len(), 1);
        let encoding = request
            .lines()
            .find(|line| line.starts_with("accept-encoding:"))
            .unwrap();
        assert!(encoding.contains("gzip") && encoding.contains("br"));
        assert!(!encoding.contains("deflate"));
        assert!(request.starts_with("get /html/?q=two+words+%2b+plus "));
    }

    #[tokio::test]
    async fn transport_rejects_status_type_encoding_and_slow_body() {
        for (status, headers, delay, expected) in [
            (
                "403 Forbidden",
                "Content-Type: text/html\r\n",
                Duration::ZERO,
                FailureCode::HttpForbidden,
            ),
            (
                "302 Found",
                "Content-Type: text/html\r\nLocation: http://127.0.0.1:1/\r\n",
                Duration::ZERO,
                FailureCode::HttpRedirect,
            ),
            (
                "200 OK",
                "Content-Type: application/json\r\n",
                Duration::ZERO,
                FailureCode::ContentType,
            ),
            (
                "200 OK",
                "Content-Type: text/html\r\nContent-Encoding: deflate\r\n",
                Duration::ZERO,
                FailureCode::ContentEncoding,
            ),
            (
                "200 OK",
                "Content-Type: text/html\r\n",
                Duration::from_millis(150),
                FailureCode::Timeout,
            ),
        ] {
            let (url, server) = fixture(status, headers, b"some body".to_vec(), delay);
            let timeout = if delay.is_zero() {
                Duration::from_secs(2)
            } else {
                Duration::from_millis(50)
            };
            let outcome = search_at(&client(), &url, "public fixture", 5, timeout).await;
            server.join().unwrap();
            assert_eq!(outcome.unwrap_err(), expected);
        }
    }

    #[tokio::test]
    async fn transport_bounds_decompressed_body() {
        // Deterministic gzip of MAX_BODY_BYTES + 1 ASCII x bytes, generated
        // offline. The encoded body is small; the decoded size must be bounded.
        let encoded = "1f8b08000000000002ffedc13101000000c2a0da8b6f0c1fa000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ce0641d1a7a101002000";
        let bytes: Vec<u8> = encoded
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect();
        let (url, server) = fixture(
            "200 OK",
            "Content-Type: text/html\r\nContent-Encoding: gzip\r\n",
            bytes,
            Duration::ZERO,
        );
        let outcome = search_at(&client(), &url, "fixture", 5, Duration::from_secs(2)).await;
        server.join().unwrap();
        assert_eq!(outcome.unwrap_err(), FailureCode::BodyLimit);
    }
    #[tokio::test]
    async fn reqwest_timeout_is_not_reported_as_generic_body_failure() {
        let (url, server) = fixture(
            "200 OK",
            "Content-Type: text/html\r\n",
            b"delayed body".to_vec(),
            Duration::from_millis(300),
        );
        let client =
            super::super::build_pinned_http_client(&[], Duration::from_millis(100)).unwrap();
        let outcome = search_at(&client, &url, "fixture", 3, Duration::from_secs(2)).await;
        server.join().unwrap();
        assert_eq!(outcome.unwrap_err(), FailureCode::Timeout);
    }
}
