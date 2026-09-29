//! Explicit opt-in scholarly discovery. Indexed links are not fetched body evidence.
use super::FailureCode;
use metadata_search_engine_rs::models::SearchResult;
use reqwest::{Client, header};
use serde_json::Value;
use std::time::Duration;
use url::Url;

const ENDPOINT: &str = "https://api.openalex.org/works";
const MAX_BODY: usize = 2 * 1024 * 1024;
const MAX_TEXT: usize = 16 * 1024;
pub struct Discovery {
    pub results: Vec<SearchResult>,
    pub reported_cost_usd: Option<f64>,
}
impl std::fmt::Debug for Discovery {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Discovery")
    }
}
type Outcome = Result<Discovery, FailureCode>;

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
            .query(&[("search", query), ("per-page", &limit.to_string())])
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
        if !["application/json"]
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

fn destination(raw: &str) -> Result<Option<String>, FailureCode> {
    if raw.len() > 8192 {
        return Err(FailureCode::BodyLimit);
    }
    let Ok(url) = Url::parse(raw) else {
        return Ok(None);
    };
    let Some(host) = url.host_str() else {
        return Ok(None);
    };
    let host = host.trim_end_matches('.');
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|p| p != 443)
        || !host.contains('.')
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host
            .trim_matches(['[', ']'])
            .parse()
            .is_ok_and(super::is_private_or_reserved)
    {
        return Ok(None);
    }
    Ok(Some(url.into()))
}

fn parse(body: &str, limit: usize, query: &str) -> Outcome {
    if body.len() > MAX_BODY {
        return Err(FailureCode::BodyLimit);
    }
    if limit == 0 || limit > 20 {
        return Err(FailureCode::ResultLimit);
    }
    let value: Value = serde_json::from_str(body).map_err(|_| FailureCode::Parse)?;
    let meta = value
        .get("meta")
        .and_then(Value::as_object)
        .ok_or(FailureCode::Parse)?;
    if meta.get("page").and_then(Value::as_u64) != Some(1)
        || meta.get("per_page").and_then(Value::as_u64) != Some(limit as u64)
        || meta.get("count").and_then(Value::as_u64).is_none()
    {
        return Err(FailureCode::Parse);
    }
    let observed = meta
        .get("x_query")
        .and_then(|x| x.get("oqo"))
        .ok_or(FailureCode::QueryMismatch)?;
    let filters = observed
        .get("filter_rows")
        .and_then(Value::as_array)
        .ok_or(FailureCode::QueryMismatch)?;
    if observed.get("get_rows").and_then(Value::as_str) != Some("works")
        || filters.len() != 1
        || filters[0].get("column_id").and_then(Value::as_str) != Some("fulltext.search")
        || filters[0].get("operator").and_then(Value::as_str) != Some("has")
        || filters[0].get("value").and_then(Value::as_str) != Some(query)
    {
        return Err(FailureCode::QueryMismatch);
    }
    let rows = value
        .get("results")
        .and_then(Value::as_array)
        .ok_or(FailureCode::Parse)?;
    if rows.len() > limit {
        return Err(FailureCode::ResultLimit);
    }
    if (rows.is_empty() && meta["count"].as_u64().unwrap() != 0)
        || meta["count"].as_u64().unwrap() < rows.len() as u64
    {
        return Err(FailureCode::Parse);
    }
    let reported_cost_usd = match meta.get("cost_usd") {
        None => None,
        Some(value) => {
            let cost = value.as_f64().ok_or(FailureCode::Parse)?;
            if !cost.is_finite() || !(0.0..=1_000_000.0).contains(&cost) {
                return Err(FailureCode::Parse);
            }
            Some(cost)
        }
    };
    let mut seen = std::collections::HashSet::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut results = Vec::new();
    for row in rows {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .ok_or(FailureCode::Parse)?;
        let suffix = id
            .strip_prefix("https://openalex.org/W")
            .ok_or(FailureCode::Parse)?;
        if suffix.is_empty() || suffix.len() > 24 || !suffix.bytes().all(|b| b.is_ascii_digit()) {
            return Err(FailureCode::Parse);
        }
        let title = row
            .get("title")
            .and_then(Value::as_str)
            .ok_or(FailureCode::Parse)?;
        if title.trim().is_empty() || title.len() > MAX_TEXT {
            return Err(FailureCode::Parse);
        }
        let mut candidates = Vec::new();
        let mut locations = Vec::new();
        for field in ["best_oa_location", "primary_location"] {
            match row.get(field) {
                None | Some(Value::Null) => {}
                Some(Value::Object(location)) => {
                    if field == "best_oa_location"
                        && location.get("is_oa").and_then(Value::as_bool) != Some(true)
                    {
                        return Err(FailureCode::Parse);
                    }
                    locations.push(location);
                }
                _ => return Err(FailureCode::Parse),
            }
        }
        match row.get("locations") {
            None | Some(Value::Null) => {}
            Some(Value::Array(values)) if values.len() <= 256 => {
                for value in values {
                    let location = value.as_object().ok_or(FailureCode::Parse)?;
                    if location.get("is_oa").and_then(Value::as_bool).is_none() {
                        return Err(FailureCode::Parse);
                    }
                    if location["is_oa"] == true {
                        locations.push(location);
                    }
                }
            }
            _ => return Err(FailureCode::Parse),
        }
        for location in locations {
            for key in ["landing_page_url", "pdf_url"] {
                match location.get(key) {
                    None | Some(Value::Null) => {}
                    Some(Value::String(raw)) => {
                        let Some(url) = destination(raw)? else {
                            continue;
                        };
                        let parsed = Url::parse(&url).unwrap();
                        let host = parsed.host_str().unwrap();
                        let archive_article = (host == "europepmc.org"
                            || host == "www.europepmc.org")
                            && parsed.path().starts_with("/articles/")
                            || host == "pmc.ncbi.nlm.nih.gov"
                                && parsed.path().starts_with("/articles/")
                            || (host == "www.ncbi.nlm.nih.gov" || host == "ncbi.nlm.nih.gov")
                                && parsed.path().starts_with("/pmc/articles/");
                        let priority = if host == "doi.org" {
                            4
                        } else if key == "pdf_url"
                            || parsed.path().to_ascii_lowercase().ends_with(".pdf")
                        {
                            2
                        } else if archive_article {
                            0
                        } else if location.get("is_oa").and_then(Value::as_bool) == Some(true) {
                            1
                        } else {
                            3
                        };
                        candidates.push((priority, url));
                    }
                    _ => return Err(FailureCode::Parse),
                }
            }
        }
        match row.get("doi") {
            None | Some(Value::Null) => {}
            Some(Value::String(raw)) => {
                if let Some(url) = destination(raw)? {
                    if Url::parse(&url).unwrap().host_str() != Some("doi.org") {
                        return Err(FailureCode::Parse);
                    }
                    candidates.push((4, url));
                }
            }
            _ => return Err(FailureCode::Parse),
        }
        // Prefer observed direct destinations over DOI redirectors; preserve stable location order.
        candidates.sort_by_key(|(priority, _)| *priority);
        let Some((_, url)) = candidates.into_iter().next() else {
            continue;
        };
        if seen_ids.insert(id.to_owned()) && seen.insert(url.clone()) {
            results.push(SearchResult {
                title: title.split_whitespace().collect::<Vec<_>>().join(" "),
                url,
                snippet: Some("Scholarly index metadata; full text not fetched.".into()),
                source_engine: "openalex".into(),
            });
        }
    }
    if !rows.is_empty() && results.is_empty() {
        return Err(FailureCode::UnverifiedEmpty);
    }
    Ok(Discovery {
        results,
        reported_cost_usd,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn row() -> Value {
        serde_json::json!({"id":"https://openalex.org/W123", "title":"Microalgae harvesting energy efficiency", "doi":"https://doi.org/10.1234/paper", "best_oa_location":{"is_oa":true,"landing_page_url":"https://repository.example/paper","pdf_url":"https://repository.example/paper.pdf"}})
    }
    fn response(rows: Vec<Value>) -> Value {
        serde_json::json!({"meta":{"page":1,"per_page":3,"count":rows.len(),"x_query":{"oqo":{"get_rows":"works","filter_rows":[{"column_id":"fulltext.search","operator":"has","value":"microalgae"}]}}},"results":rows})
    }
    fn check(value: Value) -> Outcome {
        parse(&value.to_string(), 3, "microalgae")
    }
    #[test]
    fn discovery_prefers_observed_oa_landing_and_deduplicates() {
        let results = check(response(vec![row(), row()])).unwrap().results;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, "https://repository.example/paper");
        assert_eq!(results[0].source_engine, "openalex");
        assert_eq!(
            results[0].snippet.as_deref(),
            Some("Scholarly index metadata; full text not fetched.")
        );
        let mut r = row();
        r["best_oa_location"] = Value::Null;
        assert_eq!(
            check(response(vec![r])).unwrap().results[0].url,
            "https://doi.org/10.1234/paper"
        );
        assert!(check(response(vec![])).unwrap().results.is_empty());
    }
    #[test]
    fn prefers_only_observed_open_archive_html_locations() {
        let mut r = row();
        r["locations"] = json!([{ "is_oa":true,"landing_page_url":"https://www.ncbi.nlm.nih.gov/pmc/articles/3172406","pdf_url":null }]);
        assert_eq!(
            check(response(vec![r.clone()])).unwrap().results[0].url,
            "https://www.ncbi.nlm.nih.gov/pmc/articles/3172406"
        );
        r["locations"][0]["is_oa"] = json!(false);
        assert_eq!(
            check(response(vec![r.clone()])).unwrap().results[0].url,
            "https://repository.example/paper"
        );
        r["locations"][0]["is_oa"] = json!(true);
        r["locations"][0]["landing_page_url"] = json!("https://127.0.0.1/x");
        assert_eq!(
            check(response(vec![r])).unwrap().results[0].url,
            "https://repository.example/paper"
        );
        let mut bad = response(vec![row()]);
        bad["meta"]["cost_usd"] = json!(-1);
        assert!(check(bad).is_err());
    }
    #[test]
    fn rejects_schema_query_and_bounds() {
        for path in [
            "/meta/page",
            "/meta/per_page",
            "/meta/count",
            "/results/0/title",
            "/results/0/id",
            "/results/0/best_oa_location/is_oa",
        ] {
            let mut v = response(vec![row()]);
            *v.pointer_mut(path).unwrap() = Value::Null;
            assert!(check(v).is_err(), "{path}");
        }
        let mut wrong = response(vec![]);
        wrong["meta"]["x_query"]["oqo"]["filter_rows"][0]["value"] = Value::String("other".into());
        assert_eq!(check(wrong).unwrap_err(), FailureCode::QueryMismatch);
        assert_eq!(
            check(response(vec![row(), row(), row(), row()])).unwrap_err(),
            FailureCode::ResultLimit
        );
        assert_eq!(
            parse(&" ".repeat(MAX_BODY + 1), 3, "microalgae").unwrap_err(),
            FailureCode::BodyLimit
        );
        assert!(parse("not JSON", 3, "microalgae").is_err());
        assert_eq!(
            parse("{}", 0, "microalgae").unwrap_err(),
            FailureCode::ResultLimit
        );
    }
    #[test]
    fn filters_unusable_destinations_without_losing_valid_rows_or_promoting_urls() {
        for raw in [
            "http://repository.example/paper",
            "https://127.0.0.1/a",
            "https://10.0.0.1/a",
            "https://user:password@example.com/a",
            "https://[::1]/a",
            "https://localhost/a",
            "https://localhost./a",
            "https://host.local./a",
            "https://host.localhost./a",
            "file:///tmp/a",
            "https://example.com:8443/a",
            "not a URL",
            "",
        ] {
            let mut unusable = row();
            unusable["best_oa_location"]["landing_page_url"] = json!(raw);
            unusable["best_oa_location"]["pdf_url"] = json!(raw);
            unusable["doi"] = json!("http://doi.org/10.1234/old");
            assert_eq!(
                check(response(vec![unusable.clone()])).unwrap_err(),
                FailureCode::UnverifiedEmpty,
                "{raw}"
            );
            let mut good = row();
            good["id"] = json!("https://openalex.org/W456");
            let results = check(response(vec![unusable.clone(), good]))
                .unwrap()
                .results;
            assert_eq!(results.len(), 1, "{raw}");
            assert_eq!(results[0].url, "https://repository.example/paper", "{raw}");
            unusable["locations"] = json!([{"is_oa":true,"landing_page_url":"https://europepmc.org/articles/PMC3172406"}]);
            let results = check(response(vec![unusable])).unwrap().results;
            assert_eq!(results.len(), 1, "{raw}");
            assert_eq!(
                results[0].url, "https://europepmc.org/articles/PMC3172406",
                "{raw}"
            );
        }
    }
    #[test]
    fn keeps_destination_type_and_size_failures_after_valid_candidates() {
        for key in ["landing_page_url", "pdf_url"] {
            for value in [json!(42), json!(false), json!([]), json!({})] {
                let mut r = row();
                r["locations"] = json!([{"is_oa":true,key:value}]);
                assert_eq!(check(response(vec![r])).unwrap_err(), FailureCode::Parse);
            }
        }
        let mut r = row();
        r["doi"] = json!(42);
        assert_eq!(check(response(vec![r])).unwrap_err(), FailureCode::Parse);
        let mut r = row();
        r["doi"] = json!("https://other.example/paper");
        assert_eq!(check(response(vec![r])).unwrap_err(), FailureCode::Parse);
        let mut r = row();
        r["locations"] = json!([{"is_oa":true,"landing_page_url":"x".repeat(8193)}]);
        assert_eq!(
            check(response(vec![r])).unwrap_err(),
            FailureCode::BodyLimit
        );
    }
    #[test]
    fn pins_fixed_json_request_and_bounds_transport() {
        use std::io::{Read, Write};
        for (status, kind, body, expected) in [
            (
                "200 OK",
                "application/json",
                response(vec![row()]).to_string(),
                None,
            ),
            (
                "302 Found",
                "application/json",
                String::new(),
                Some(FailureCode::HttpRedirect),
            ),
            (
                "403 Forbidden",
                "application/json",
                String::new(),
                Some(FailureCode::HttpForbidden),
            ),
            (
                "200 OK",
                "text/html",
                "<html>challenge</html>".into(),
                Some(FailureCode::ContentType),
            ),
            (
                "200 OK",
                "application/json",
                "x".repeat(MAX_BODY + 1),
                Some(FailureCode::BodyLimit),
            ),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let endpoint = format!("http://{}/works", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let deadline = std::time::Instant::now() + Duration::from_secs(4);
                let (mut socket, _) = loop {
                    match listener.accept() {
                        Ok(value) => break value,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(
                                std::time::Instant::now() < deadline,
                                "fixture accept deadline"
                            );
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(error) => panic!("{error}"),
                    }
                };
                socket.set_nonblocking(false).unwrap();
                socket
                    .set_write_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut byte = [0];
                while !bytes.ends_with(b"\r\n\r\n") {
                    assert!(bytes.len() < 8192);
                    socket.read_exact(&mut byte).unwrap();
                    bytes.push(byte[0]);
                }
                let request = String::from_utf8(bytes).unwrap();
                assert!(
                    request.starts_with("GET /works?search=microalgae&per-page=3 HTTP/1.1\r\n")
                );
                assert!(!request.to_lowercase().contains("authorization:"));
                assert!(!request.to_lowercase().contains("cookie:"));
                let head = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nLocation: http://127.0.0.1:1/never\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                socket.write_all(head.as_bytes()).unwrap();
                let _ = socket.write_all(body.as_bytes());
            });
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            let result = runtime.block_on(async {
                let client = Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .unwrap();
                search_at(&client, &endpoint, "microalgae", 3, Duration::from_secs(3)).await
            });
            server.join().unwrap();
            if let Some(code) = expected {
                assert_eq!(result.unwrap_err(), code);
            } else {
                assert_eq!(result.unwrap().results.len(), 1);
            }
        }
    }
    #[test]
    #[ignore = "requires explicitly supplied retained JSON; performs no network requests"]
    fn retained_public_response_offline() {
        let path =
            std::env::var("WORDCELL_OPENALEX_RETAINED_JSON").expect("supply retained JSON path");
        let body = std::fs::read_to_string(path).unwrap();
        let result = parse(&body, 10, "microalgae harvesting energy efficiency").unwrap();
        assert_eq!(result.reported_cost_usd, Some(0.001));
        let rows = result.results;
        assert!(!rows.is_empty());
        assert!(rows.iter().any(|r| r.title.contains("harvesting")));
    }
}
