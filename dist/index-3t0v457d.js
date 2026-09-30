// @bun
// src/evaluation-builder-cli-args.ts
var kbEvidenceRoutingBuildUsage = `Usage: wordcell-evaluation-builder <--anchor-seal|--build> --config <checked-config.json> --artifact-root <artifact-B>
` + "       wordcell-evaluation-builder update [check|status|enable|disable] [--json]";
function parseKbEvidenceRoutingBuildCliArguments(arguments_) {
  const mode = arguments_[0];
  const configPath = arguments_[2];
  const artifactRoot = arguments_[4];
  if (arguments_.length !== 5 || mode !== "--anchor-seal" && mode !== "--build" || arguments_[1] !== "--config" || arguments_[3] !== "--artifact-root" || configPath === undefined || configPath.trim() === "" || artifactRoot === undefined || artifactRoot.trim() === "") {
    throw new Error(kbEvidenceRoutingBuildUsage);
  }
  return Object.freeze({ mode: mode.slice(2), configPath, artifactRoot });
}
function isEvaluationBuilderHelp(arguments_) {
  return arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h");
}

export { kbEvidenceRoutingBuildUsage, parseKbEvidenceRoutingBuildCliArguments, isEvaluationBuilderHelp };
