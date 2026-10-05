import type { Metadata } from "next";
import { MarketingSection, ProductHero } from "@hraness/design-kit/react/server";

import { BenchmarkComparison } from "../../wordcell/benchmark-comparison";
import { scifactDetails, scifactStudy } from "../../wordcell/benchmark-evidence";
import { grouped, longDate, prose, signed } from "../../wordcell/format";
import {
  longMemEvalArms,
  longMemEvalComparison,
  longMemEvalFacts,
  longMemEvalLimitQuotes,
  longMemEvalStudy,
  longMemEvalTypes,
  locomoArms,
  locomoCategories,
  locomoFacts,
  locomoLimitQuotes,
  locomoPaired,
  locomoStudy,
  ohAttribution,
  ohLinks,
  ohLongMemEvalPost,
} from "../../wordcell/oh-evidence";
import { WordcellPageChrome } from "../../wordcell/page-chrome";
import { publishedClaims, publishedClaimsCheckedOn } from "../../wordcell/published-claims";
import { publishedRelease } from "../publication";
import { routeTitles } from "../route-titles";

const pageTitle = routeTitles.benchmarks.title;
const pageDescription =
  `Wordcell search results on ${scifactDetails.queries} SciFact queries, plus Oh’s memory benchmarks, with the datasets, methods, and source data for each study.`;

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
  ? "First Wordcell release in preparation."
  : `Latest release: v${publishedRelease.version}.`;

const [miniPaired, nanoPaired] = locomoPaired;
const [locomoLimitSaturation, locomoLimitHarness, locomoLimitUnseen] = locomoLimitQuotes;
const [semanticArm, bm25Arm] = longMemEvalArms;
const primary = longMemEvalComparison.primary;
const meanDifference = longMemEvalComparison.mean;

export default function Benchmarks() {
  if (miniPaired === undefined || nanoPaired === undefined) throw new TypeError("LoCoMo paired results need both readers.");
  if (semanticArm === undefined || bm25Arm === undefined) throw new TypeError("LongMemEval-S results need both matched arms.");
  return (
    <WordcellPageChrome path="/benchmarks">
      <ProductHero
        backdrop={false}
        align="start"
        boundary={status}
        className="wordcell-marketing-hero"
        eyebrow="Benchmarks"
        heading="Wordcell measurements with source data"
        headingId="hero-title"
        name=""
        summary={`Compare the historical September 2026 Wordcell exact-search and Jev reranking results on ${scifactDetails.queries} questions about scientific abstracts. Explore the memory-retrieval studies from Oh, the graph library Wordcell uses.`}
      />

      <MarketingSection
        heading="Wordcell search with optional reranking"
        headingId="wordcell-title"
        id="wordcell"
        summary={`Jev reranking put a relevant scientific abstract first for ${scifactDetails.rerankedFirstResults} of ${scifactDetails.queries} queries, compared with ${scifactDetails.exactFirstResults} for exact search alone.`}
      >
        <BenchmarkComparison study={scifactStudy}>
          <p>nDCG at five rose from {scifactDetails.baselineNdcg} to {scifactDetails.rerankedNdcg}. It improved for {scifactDetails.improved} queries and regressed for {scifactDetails.regressed}. For {scifactDetails.missing} queries, neither candidate window contained a judged relevant source.</p>
          <p>This September 2026 study used Jev and scientific abstracts. It measures source ranking, not the current Cloudflare Clef integration or results on your notes. Hosted reranking sends the query and candidate snippets to a paid provider only when you enable it.</p>
        </BenchmarkComparison>
      </MarketingSection>

      <MarketingSection
        heading="Memory retrieval in the Oh graph library"
        headingId="oh-title"
        id="oh"
        summary="Oh, the graph library Wordcell uses, evaluates memory retrieval on public conversation datasets."
      >
        <BenchmarkComparison study={longMemEvalStudy}>
          <p>On the measure Oh named before the run, questions answered correctly in at least two of {prose(longMemEvalFacts.runsPerQuestion)} runs, Oh semantic retrieval got {grouped(semanticArm.majorityCorrect)} of {grouped(longMemEvalFacts.questions)} and BM25 got {grouped(bm25Arm.majorityCorrect)}. That is {signed(primary.difference, 1)} percentage points, with a {primary.level} interval from {signed(primary.lower, 1)} to {signed(primary.upper, 1)}.{longMemEvalComparison.tieNotRuledOut ? " The interval reaches zero, so this result does not rule out a tie." : ""} Oh semantic retrieval gained {grouped(longMemEvalComparison.gained)} questions and lost {grouped(longMemEvalComparison.lost)}.</p>
          <p>On the mean of {prose(longMemEvalFacts.runsPerQuestion)} runs shown in the chart, the difference is {signed(meanDifference.difference)} points, with a {meanDifference.level} interval from {signed(meanDifference.lower)} to {signed(meanDifference.upper)}. Oh’s intervals come from resampling questions within each question type.</p>
          <p>This is Oh’s retrieval measured on its own. It is not a measurement of Wordcell search, and it includes no matched run of Supermemory or any other memory framework.</p>
        </BenchmarkComparison>

        <div aria-label="LongMemEval-S answers judged correct by question type" className="wordcell-comparison wordcell-stack" role="region" tabIndex={0}>
          <table>
            <caption className="wordcell-table-caption">LongMemEval-S answers judged correct by question type, mean of {prose(longMemEvalFacts.runsPerQuestion)} runs, in percent</caption>
            <thead>
              <tr>
                <th scope="col">Question type</th>
                <th scope="col">Questions</th>
                {longMemEvalArms.map((arm) => <th key={arm.id} scope="col">{arm.system}</th>)}
              </tr>
            </thead>
            <tbody>
              {longMemEvalTypes.map((type) => (
                <tr key={type.id}>
                  <th scope="row">{type.name}</th>
                  <td data-label="Questions">{grouped(type.questions)}</td>
                  {type.percents.map((percent, index) => {
                    const arm = longMemEvalArms[index];
                    return <td data-label={arm?.system} key={arm?.id ?? index}>{percent}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="install-note">{ohAttribution}</p>
        <details className="wordcell-benchmark-method">
          <summary>LongMemEval-S study notes</summary>
        <ul className="wordcell-limits">
          <li>Oh reports that “{longMemEvalLimitQuotes.exposure},” so none of the {grouped(longMemEvalFacts.questions)} questions is unseen.</li>
          <li>Oh’s limits say: “{longMemEvalLimitQuotes.aliases}”</li>
          <li>Oh adds: “{longMemEvalLimitQuotes.audit}”</li>
        </ul>
        </details>

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

        <details className="wordcell-benchmark-method">
          <summary>LoCoMo study notes</summary>
        <ul className="wordcell-limits">
          <li>Oh’s own summary says these results “{locomoLimitSaturation}.”</li>
          <li>Oh’s summary adds: “{locomoLimitHarness}.”</li>
          <li>Of the questions evaluated before and those used in development, Oh says “{locomoLimitUnseen}.”</li>
          <li>The file records no run date or hardware. The date shown is when Oh published the result, {longDate(locomoFacts.publishedOn)}.</li>
        </ul>
        </details>
      </MarketingSection>

      <MarketingSection
        heading="Published results from other memory systems"
        headingId="comparisons-title"
        id="comparisons"
        summary="Explore each system’s reported results and the source behind them."
      >
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
        heading="Where each figure comes from"
        headingId="reproduce-title"
        id="reproduce"
        summary="Each Wordcell and Oh figure on this page comes from a file you can read and a procedure you can rerun. The published figures in the table link their sources."
      >
        <ul className="wordcell-limits">
          <li><a href="/docs/reranking#evidence-and-limits">Reranking study: evidence and limits</a></li>
          <li><a href={ohLinks.longMemEvalResult}>Oh’s LongMemEval-S result on all {grouped(longMemEvalFacts.questions)} questions</a> and <a href={ohLongMemEvalPost}>Oh’s write-up of it</a></li>
          <li><a href={ohLinks.locomoResult}>Oh’s LoCoMo result</a> and <a href={ohLinks.pilotResult}>Oh’s LongMemEval pilot result</a></li>
          <li><a href={ohLinks.benchmarks}>Oh’s benchmark guide</a></li>

        </ul>
      </MarketingSection>
    </WordcellPageChrome>
  );
}
