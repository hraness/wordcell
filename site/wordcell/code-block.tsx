import { MarketingProofFrame, SyntaxCode } from "@hraness/design-kit/react/server";

export function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  return <pre tabIndex={0}><SyntaxCode code={code} language={language} styles="classes" /></pre>;
}

export function Terminal({ code, title = "Terminal" }: { code: string; title?: string }) {
  return <MarketingProofFrame title={title}><CodeBlock code={code} language="shell" /></MarketingProofFrame>;
}
