#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { runWordcellBin } from "./cli-update.js";

if (import.meta.main) process.exitCode = await runWordcellBin("wordcell-evaluation-builder", fileURLToPath(import.meta.url), process.argv.slice(2));
