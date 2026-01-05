# Documentation Index

This directory contains organized documentation for the LLM Flux Gateway project.

## Directory Structure

```
docs/
├── bug-fixes/     # Bug fix reports and analyses (14 files)
├── development/   # Development guides and architecture (12 files)
├── fixes/         # Specific issue fixes
├── guides/        # User guides and quick references (6 files)
├── logging/       # Logging and debugging documentation (13 files)
├── protocol/      # Protocol transformation documentation (8 files)
├── research/      # Research and analysis reports (31 files)
└── testing/       # Testing documentation (7 files)
```

**Total**: 95 documentation files

## Quick Links

### Getting Started
- [Quick Start Guide](guides/quick-start.md)
- [GLM Quick Start Guide](guides/glm-quick-start.md)
- [Usage Scenarios](guides/usage-scenarios.md)

### Bug Fixes (14 files)
- [Tool Calling Streaming Bug Analysis](bug-fixes/tool-calling-streaming-bug-analysis.md)
- [Client-Side Tool Call Fix](bug-fixes/client-side-tool-call-fix.md)
- [Comprehensive Tool Call Report](bug-fixes/comprehensive-tool-call-report.md)
- [Text Field Bug Analysis](bug-fixes/text-field-bug-analysis.md)
- [Text Field Bug Fix Report](bug-fixes/text-field-bug-fix-report.md)
- [Type Error Fixes Phase 3B Report](bug-fixes/type-error-fixes-phase-3b-report.md)
- [Type Error Fix Plan](bug-fixes/type-error-fix-plan.md)
- [Type Error Fix Progress](bug-fixes/type-error-fix-progress.md)
- [Gateway Controller Type Fix](bug-fixes/gateway-controller-type-fix.md)
- [Phase 1 Bug Fix Summary](bug-fixes/phase1-bug-fix-summary.md)
- [Playground Format Fix Complete](bug-fixes/playground-format-fix-complete.md)
- [Tool Call Fix Report](bug-fixes/tool-call-fix-report.md)
- [Tool Calls Architecture Issue](bug-fixes/tool-calls-architecture-issue.md)
- [Tool Calls Root Cause Found](bug-fixes/tool-calls-root-cause-found.md)

### Development & Architecture (12 files)
- [Project Requirements](development/project-requirements.md)
- [Project Requirements and Flows](development/project-requirements-and-flows.md)
- [Architecture Analysis](development/architecture-analysis.md)
- [Architecture Cleanup Report](development/architecture-cleanup-report.md)
- [Onion Architecture Analysis](development/onion-architecture-analysis.md)
- [Comprehensive Redesign Summary](development/comprehensive-redesign-summary.md)
- [Refactoring Plan](development/refactoring-plan.md)
- [Format Inferer Refactoring](development/format-inferer-refactoring.md)
- [Gateway Controller Format Cleanup](development/gateway-controller-format-cleanup.md)
- [Gateway Fallback Removal Report](development/gateway-fallback-removal-report.md)
- [Implementation Summary](development/implementation-summary.md)
- [Parallel Fix Execution Plan](development/parallel-fix-execution-plan.md)

### Protocol Transformation (8 files)
- [Protocol Transformation Architecture](protocol/protocol-transformation-architecture.md)
- [Protocol Refactoring Plan](protocol/protocol-refactoring-plan.md)
- [Protocol Transpiler Core Design](protocol/protocol-transpiler-core-design.md)
- [Protocol Conversion Fix 2A1098](protocol/protocol-conversion-fix-2a1098.md)
- [Protocol Fix Quick Reference](protocol/protocol-fix-quick-reference.md)
- [Protocol Fix Visual Summary](protocol/protocol-fix-visual-summary.md)
- [Protocol Conversion Fix Summary](protocol/protocol-conversion-fix-summary.md)
- [Protocol Transpiler Optimization Report](protocol/protocol-transpiler-optimization-report.md)

### Logging & Debugging (13 files)
- [Protocol Logging Examples](logging/protocol-logging-examples.md)
- [Logging Fix Quick Reference](logging/logging-fix-quick-reference.md)
- [Logging Fix Summary](logging/logging-fix-summary.md)
- [Logging Implementation Summary](logging/logging-implementation-summary.md)
- [Logging Improvements Report](logging/logging-improvements-report.md)
- [Logging Quick Reference](logging/logging-quick-reference.md)
- [Protocol Transformation Logging Enhancement](logging/protocol-transformation-logging-enhancement.md)
- [Debug Log Test Request](logging/debug-log-test-request.md)
- [Debug Logging Added](logging/debug-logging-added.md)
- [Logging Improvement Plan](logging/logging-improvement-plan.md)
- [Request Trace Logging Implementation](logging/request-trace-logging-implementation.md)
- [Request Trace Quick Reference](logging/request-trace-quick-reference.md)
- [Trace Log Data Integrity Analysis](logging/trace-log-data-integrity-analysis.md)

### Research Reports (31 files)
- [GLM Tool Calling 16 Combinations Report](research/glm-tool-calling-16-combinations-report.md)
- [Internal Stream Chunk Conversion Test Summary](research/internal-stream-chunk-conversion-test-summary.md)
- [Type Error Fix Progress](research/type-error-fix-progress.md)
- [Type Error Fix Final Report](research/type-error-fix-final-report.md)
- [Type Error Fix Plan](research/type-error-fix-plan.md)
- [Phase 1 Summary](research/phase1-summary.md)
- [Phase 1 Fix Report](research/phase1-fix-report.md)
- [Phase 2 Type Error Fix Report](research/phase2-type-error-fix-report.md)
- [Phase 5 Summary](research/phase5-summary.md)
- [Phase 5 Final Report](research/phase5-final-report.md)
- [Phase 6 Type Error Fix Report](research/phase6-type-error-fix-report.md)
- [Phase 4 Server Fixes Report](research/phase-4-server-fixes-report.md)
- [Comprehensive Research Plan](research/comprehensive-research-plan.md)
- [Truncation Research Report](research/truncation-research-report.md)
- [Internal Format CamelCase Research](research/internal-format-camelcase-research.md)
- [SSE Formats Research](research/sse-formats-research.md)
- [Tool Call JSON Analysis](research/tool-call-json-analysis.md)
- [SSE Parser Deep Dive](research/sse-parser-deep-dive.md)
- [Attribute Overrides Data Flow](research/attribute-overrides-data-flow.md)
- [Attribute Overrides Summary](research/attribute-overrides-summary.md)
- [Attribute Overrides Investigation Report](research/attribute-overrides-investigation-report.md)
- [Backpressure Analysis](research/backpressure-analysis.md)
- [Streaming Indicator Investigation](research/streaming-indicator-investigation.md)
- [Streaming Indicator Implementation](research/streaming-indicator-implementation.md)
- [Streaming Indicator Code Diffs](research/streaming-indicator-code-diffs.md)
- [Streaming Indicator Quick Reference](research/streaming-indicator-quick-reference.md)
- [Format Conversion Diagnostic Report](research/format-conversion-diagnostic-report.md)
- [Format Fix Comparison](research/format-fix-comparison.md)
- [Fixes Implementation Report](research/fixes-implementation-report.md)
- [Scheme E Implementation Report](research/scheme-e-implementation-report.md)
- [Logs Analysis Report](research/logs-analysis-report.md)
- [Model Selector Behavior](research/model-selector-behavior.md)

### Testing (7 files)
- [Tool Call Streaming Test Implementation](testing/tool-call-streaming-test-implementation.md)
- [Streaming Tools Test Summary](testing/streaming-tools-test-summary.md)
- [Test Data Quick Reference](testing/test-data-quick-reference.md)
- [Test Type Safety Quick Reference](testing/test-type-safety-quick-reference.md)
- [Quality Assurance Setup Report](testing/quality-assurance-setup-report.md)
- [Performance Test Plan](testing/performance-test-plan.md)
- [Test Structured Content Fix](testing/test-structured-content-fix.md)

### Guides & Quick References (6 files)
- [Quick Start](guides/quick-start.md)
- [GLM Quick Start](guides/glm-quick-start.md)
- [TypeScript Error Fixes](guides/typescript-error-fixes.md)
- [Quick Reference](guides/quick-reference.md)
- [Usage Scenarios](guides/usage-scenarios.md)
- [Playground Tools Feature](guides/playground-tools-feature.md)

---

**Last Updated**: 2026-01-06
**Status**: ✅ Documentation reorganization complete
**Total Files**: 95 markdown files organized into 7 categories
