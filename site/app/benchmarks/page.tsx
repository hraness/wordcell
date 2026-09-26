import type { Metadata } from "next";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { BenchmarkComparison } from "../../wordcell/benchmark-comparison";
import { scifactDetails, scifactStudy } from "../../wordcell/benchmark-evidence";
import { grouped, longDate, prose, signed } from "../../wordcell/format";
import { formatBytes, handoffEvidence } from "../../wordcell/handoff-evidence";
import {
  locomoArms,
  locomoCategories,
  locomoFacts,
  locomoLimitQuotes,
  locomoPaired,
  locomoStudy,
  ohAttribution,
  ohLinks,
  ohSources,
  pilotInterval,
  pilotLimitQuotes,
  pilotSecondaryInterval,
  pilotStudy,
} from "../../wordcell/oh-evidence";
import { WordcellPageChrome } from "../../wordcell/page-chrome";
import { publishedClaims, publishedClaimsCheckedOn } from "../../wordcell/published-claims";
import { publishedRelease } from "../publication";

const pageTitle = "Wordcell and Oh benchmarks, with their limits";
const pageDescription =
  "See Wordcell’s own payload and reranking measurements and the Oh memory kernel’s published results, each with its source data and limits.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/benchmarks" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    siteName: "Wordcell",
    type: "website",
    url: "/benchmarks",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const status = publishedRelease === null
  ? "Oh’s result files are copied byte for byte from hraness/oh at pinned commits."
  : `Latest release: v${publishedRelease.version}. Oh’s result files are copied byte for byte from hraness/oh at pinned commits.`;

const handoffShare = Math.round((handoffEvidence.packedBytes / handoffEvidence.fullNoteBytes) * 100);
const [miniPaired, nanoPaired] = locomoPaired;
const [locomoLimitSaturation, locomoLimitHarness, locomoLimitUnseen] = locomoLimitQuotes;
const [pilotLimitSample, pilotLimitGranularity, pilotLimitProfile] = pilotLimitQuotes;

function intervalSentence(interval: typeof pilotInterval): string {
  return `${interval.left} minus ${interval.right}: ${signed(interval.estimate)} percentage points, with a 95% interval from ${signed(interval.lower)} to ${signed(interval.upper)} over ${grouped(interval.pairedQuestions)} paired questions.`;
}

export default function Benchmarks() {
  if (miniPaired === undefined || nanoPaired === undefined) throw new TypeError("LoCoMo paired results need both readers.");
  return (
    <WordcellPageChrome path="/benchmarks">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={status}
        className="wordcell-marketing-hero"
        eyebrow="Benchmarks"
        heading="Each Wordcell and Oh result here links its raw data and states its limits."
        headingId="hero-title"
        name=""
        summary="Wordcell’s own measurements cover the size of a context handoff and reranking quality. The Oh memory kernel that Wordcell embeds publishes its own memory benchmarks, reported here as Oh’s results, not Wordcell’s."
      />

      <MarketingSection
        heading="What Wordcell measures"
        headingId="wordcell-title"
        id="wordcell"
        summary={`Across ${prose(handoffEvidence.queries)} queries on a ${prose(handoffEvidence.noteCount)}-note public vault, packed snippets used ${handoffEvidence.reductionPercent}% fewer UTF-8 bytes than the same notes in full.`}
      >
        <div aria-label={`Packed snippets: ${formatBytes(handoffEvidence.packedBytes)}. The same notes in full: ${formatBytes(handoffEvidence.fullNoteBytes)}.`} className="wordcell-bytes" role="group">
          <div className="wordcell-bytes-row">
            <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar wordcell-bytes-bar--primary" style={{ inlineSize: `${handoffShare}%` }} /></div>
            <p className="wordcell-bytes-meta"><strong>{formatBytes(handoffEvidence.packedBytes)}</strong><span>Packed snippets</span></p>
          </div>
          <div className="wordcell-bytes-row">
            <div className="wordcell-bytes-track"><div className="wordcell-bytes-bar" style={{ inlineSize: "100%" }} /></div>
            <p className="wordcell-bytes-meta"><strong>{formatBytes(handoffEvidence.fullNoteBytes)}</strong><span>The same notes in full</span></p>
          </div>
        </div>
        <p className="install-note">Measured with Wordcell {handoffEvidence.toolVersion}. This is payload size only: it does not measure tokens, answer quality, speed, or an advantage over another search tool. <a href="/docs/evidence">Method, raw results, and reproduction</a>.</p>

        <BenchmarkComparison study={scifactStudy}>
          <p>nDCG at five rose from {scifactDetails.baselineNdcg} to {scifactDetails.rerankedNdcg}. It improved for {scifactDetails.improved} queries and regressed for {scifactDetails.regressed}. For {scifactDetails.missing} queries, neither candidate window contained a judged relevant source.</p>
          <p>Reranking sends the query and each candidate’s title, path, and up to 512 bytes of its snippet to a paid provider. It is optional; the local search path runs without it. QMD, Letta, and Supermemory were not evaluated under this protocol.</p>
        </BenchmarkComparison>
      </MarketingSection>

      <MarketingSection
        heading="The Oh kernel Wordcell embeds, measured on its own"
        headingId="oh-title"
        id="oh"
        summary={ohAttribution}
      >
        <BenchmarkComparison study={locomoStudy}>
          <p>Paired by question with GPT-5 mini, Oh semantic retrieval was right where the BM25 window was wrong on {grouped(miniPaired.better)} questions, wrong where it was right on {grouped(miniPaired.worse)}, and matched it on {grouped(miniPaired.tied)}. With GPT-5 nano the counts were {grouped(nanoPaired.better)}, {grouped(nanoPaired.worse)}, and {grouped(nanoPaired.tied)}.</p>
        </BenchmarkComparison>

        <div aria-label="LoCoMo answers judged correct by question category" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <caption className="wordcell-table-caption">Answers judged correct by question category, in percent</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Questions</th>
                {locomoArms.map((arm) => <th key={arm.id} scope="col">{arm.system}, {arm.reader}</th>)}
              </tr>
            </thead>
            <tbody>
              {locomoCategories.map((category) => (
                <tr key={category.id}>
                  <th scope="row">{category.name}</th>
                  <td data-label="Questions">{grouped(category.questions)}</td>
                  {category.percents.map((percent, index) => {
                    const arm = locomoArms[index];
                    return <td data-label={arm ? `${arm.system}, ${arm.reader}` : undefined} key={arm?.id ?? index}>{percent}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="wordcell-limits-title" id="oh-limits">Limits</h3>
        <ul className="wordcell-limits">
          <li>Oh’s own summary says these results “{locomoLimitSaturation}.”</li>
          <li>Oh’s summary adds: “{locomoLimitHarness}.”</li>
          <li>Of the questions evaluated before and those used in development, Oh says “{locomoLimitUnseen}.”</li>
          <li>The file records no run date or hardware. The date shown is when Oh published the result, {longDate(locomoFacts.publishedOn)}.</li>
        </ul>
      </MarketingSection>

      <MarketingSection
        heading="Matched and published comparisons"
        headingId="comparisons-title"
        id="comparisons"
        summary="Oh ran one small pilot of Supermemory, Oh, and BM25 under one protocol; it is Oh’s result, not Wordcell’s. Figures that other memory systems publish use their own protocols, so they appear in a table, not a chart."
      >
        <BenchmarkComparison study={pilotStudy}>
          <p>{intervalSentence(pilotInterval)} {pilotInterval.crossesZero ? `The interval includes zero, so the pilot does not separate ${pilotInterval.left} from ${pilotInterval.right}.` : ""}</p>
          <p>{intervalSentence(pilotSecondaryInterval)} Oh reports this second comparison as descriptive only.</p>
        </BenchmarkComparison>

        <h3 className="wordcell-limits-title" id="pilot-limits">Limits</h3>
        <ul className="wordcell-limits">
          <li>Oh notes that its “{pilotLimitSample}.”</li>
          <li>In Oh’s words, “{pilotLimitGranularity}.”</li>
          <li>On Supermemory’s search profile, Oh says “{pilotLimitProfile}.”</li>
        </ul>

        <div aria-label="Selected figures other memory systems publish" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <caption className="wordcell-table-caption">Selected figures other memory systems publish on their own pages, checked {longDate(publishedClaimsCheckedOn)}</caption>
            <thead>
              <tr>
                <th scope="col">System</th>
                <th scope="col">Benchmark</th>
                <th scope="col">Published figure</th>
                <th scope="col">Metric, as the source names it</th>
                <th scope="col">Model</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {publishedClaims.map((claim) => (
                <tr key={claim.id}>
                  <th scope="row">{claim.system}</th>
                  <td data-label="Benchmark">{claim.benchmark}</td>
                  <td data-label="Published figure">{claim.figure}</td>
                  <td data-label="Metric, as the source names it">{claim.metric}</td>
                  <td data-label="Model">{claim.model}</td>
                  <td data-label="Source"><a href={claim.href}>{claim.sourceLabel}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="install-note">Each row uses its publisher’s own protocol, reader, and judge, and links its source. The rows are not a matched ranking, and they are not comparable with the charts above.</p>
      </MarketingSection>

      <MarketingSection
        heading="How to reproduce"
        headingId="reproduce-title"
        id="reproduce"
        summary="Each Wordcell and Oh figure on this page comes from a file you can read and a procedure you can rerun. The published figures in the table link their sources."
      >
        <ul className="wordcell-limits">
          <li><a href="/docs/evidence">Context handoff: method, raw results, and reproduction</a></li>
          <li><a href="/docs/reranking#evidence-and-limits">Reranking study: evidence and limits</a></li>
          <li><a href={ohLinks.locomoResult}>Oh’s LoCoMo result</a> and <a href={ohLinks.pilotResult}>Oh’s LongMemEval pilot result</a></li>
          <li><a href={ohLinks.benchmarks}>Oh’s benchmark guide</a></li>
          {ohSources.map((source) => (
            <li key={source.file}><a href={source.href}>{source.file}</a> at hraness/oh commit <code>{source.commit.slice(0, 7)}</code>, copied into <code>docs/evaluations/oh/</code> ({grouped(source.bytes)} bytes, SHA-256 <code>{source.sha256.slice(0, 12)}</code>)</li>
          ))}
        </ul>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
