import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";

import type { BenchmarkDatabase } from "../lib/db.js";
import { runHeadToHead } from "../lib/head-to-head-runner.js";
import { runMatrix } from "../lib/matrix-runner.js";
import type { RuntimeContext } from "../lib/runtime.js";
import type {
  HeadToHeadProgressEvent,
  HeadToHeadHistoryTurnDetail,
  HeadToHeadResult,
  HeadToHeadTurn,
  HistoryLeaderboardRow,
  HistoryRunDetail,
  HistoryRunSummary,
  MatchStatus,
  MatrixCellState,
  MatrixHistoryAttemptDetail,
  MatrixHistoryResultSummary,
  MatrixProgressEvent,
  MatrixResult,
  ResolvedModel,
  RuntimeOptions
} from "../lib/types.js";

type AppProps =
  | {
    mode: "history";
    db: BenchmarkDatabase;
    dbPath: string;
  }
  | {
    mode: "matrix" | "head-to-head";
    context: RuntimeContext;
    models: ResolvedModel[];
    runtimeOptions: RuntimeOptions;
    left?: ResolvedModel;
    right?: ResolvedModel;
  };

type HeadFocusPane = "turns" | "details";
type HistoryFocusPane = "runs" | "results" | "details";
type MatrixFocusPane = "matrix" | "leaderboard" | "prompts" | "messages";

const PANEL_FRAME_ROWS = 3;
const DETAIL_FOOTER_ROWS = 1;

function statusChar(status: MatchStatus | undefined): string {
  if (status === "leaked") return "L";
  if (status === "refused") return ".";
  if (status === "error") return "E";
  if (status === "running") return "*";
  if (status === "resisted") return ".";
  return " ";
}

function statusColor(status: MatchStatus | undefined): string | undefined {
  if (status === "leaked") return "red";
  if (status === "refused") return "green";
  if (status === "error") return "magenta";
  if (status === "resisted") return "green";
  if (status === "running") return "cyan";
  return "gray";
}

function uiColor(color: string | undefined, muted: boolean): string | undefined {
  if (muted) {
    return "gray";
  }
  return color;
}

function detailPaneBorderColor(status: MatchStatus | undefined): string {
  if (status === "leaked") return "red";
  if (status === "error") return "yellow";
  return "green";
}

function titleCaseStatus(status: MatchStatus | "complete" | "failed" | "running"): string {
  if (status === "leaked") return "LEAK";
  if (status === "refused") return "DEFENDED";
  if (status === "resisted") return "DEFENDED";
  if (status === "error") return "ERROR";
  if (status === "complete") return "COMPLETE";
  if (status === "failed") return "FAILED";
  return "RUNNING";
}

function appStateLabel(status: "running" | "cancelling" | "complete" | "failed" | "cancelled"): string {
  if (status === "cancelling") return "CANCELLING";
  if (status === "cancelled") return "CANCELLED";
  return titleCaseStatus(status);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function compactName(name: string, limit: number): string {
  if (name.length <= limit) {
    return name.padEnd(limit, " ");
  }
  return `${name.slice(0, Math.max(1, limit - 3))}...`.padEnd(limit, " ");
}

function compactHeaderName(name: string, limit: number): string {
  if (name.length <= limit) {
    return name.padEnd(limit, " ");
  }

  const consonants = name.replace(/[aeiou]/gi, "");
  if (consonants.length >= limit) {
    return consonants.slice(0, limit).padEnd(limit, " ");
  }

  return compactName(name, limit);
}

function truncateLine(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (text.length <= width) {
    return text;
  }
  if (width <= 3) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function makeProgressBar(completed: number, total: number, width = 18): string {
  if (total <= 0) {
    return `[${"-".repeat(width)}] 0/0`;
  }
  const ratio = Math.max(0, Math.min(1, completed / total));
  const filled = Math.round(ratio * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}] ${completed}/${total}`;
}

function severityRank(status: MatchStatus | undefined): number {
  if (status === "leaked") return 0;
  if (status === "error") return 1;
  if (status === "refused") return 2;
  if (status === "running") return 3;
  if (status === "resisted") return 4;
  return 5;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "-";
  }
  const value = Math.round((numerator / denominator) * 100);
  return `${value}%`;
}

function formatCountPercent(count: number, total: number): string {
  if (total <= 0) {
    return `${count}/0 (-)`;
  }
  return `${count}/${total} (${formatPercent(count, total)})`;
}

function rightAlign(text: string, width: number): string {
  if (text.length >= width) {
    return text;
  }
  return `${" ".repeat(width - text.length)}${text}`;
}

function defenseSafeCount(row: HistoryLeaderboardRow): number {
  return Math.max(0, row.defenseCells - row.defendLeaks);
}

function sumAttemptCosts(attempts: Array<{
  attackUsage?: { cost?: number };
  defenseUsage?: { cost?: number };
}>): number {
  return attempts.reduce((total, attempt) => {
    const attackCost = typeof attempt.attackUsage?.cost === "number" ? attempt.attackUsage.cost : 0;
    const defenseCost = typeof attempt.defenseUsage?.cost === "number" ? attempt.defenseUsage.cost : 0;
    return total + attackCost + defenseCost;
  }, 0);
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) {
    return "-";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function toDisplayLines(text: string | undefined, fallback = "(empty)"): string[] {
  if (!text) {
    return [fallback];
  }
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd());
  const normalized: string[] = [];

  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank && (normalized.length === 0 || normalized[normalized.length - 1] === "")) {
      continue;
    }
    normalized.push(isBlank ? "" : line);
  }

  while (normalized[0] === "") {
    normalized.shift();
  }
  while (normalized[normalized.length - 1] === "") {
    normalized.pop();
  }

  return normalized.length > 0 ? normalized : [fallback];
}

function clipLines(lines: string[], limit: number, expanded: boolean): string[] {
  if (expanded || lines.length <= limit) {
    return lines;
  }
  return [...lines.slice(0, limit), `... (+${lines.length - limit} more lines)`];
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0 || line.length <= width) {
    return [line];
  }

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(" ", width);
    if (splitAt <= 0) {
      splitAt = width;
    }
    wrapped.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    wrapped.push(remaining);
  }

  return wrapped.length > 0 ? wrapped : [line];
}

function wrapLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => wrapLine(line, width));
}

function panelHeightForContent(contentRows: number): number {
  return PANEL_FRAME_ROWS + Math.max(1, contentRows);
}

function scrollWindow(lines: string[], offset: number, visibleLines: number): { lines: string[]; offset: number; total: number } {
  if (visibleLines <= 0) {
    return { lines: [], offset: 0, total: lines.length };
  }

  const maxOffset = Math.max(0, lines.length - visibleLines);
  const safeOffset = Math.max(0, Math.min(offset, maxOffset));
  return {
    lines: lines.slice(safeOffset, safeOffset + visibleLines),
    offset: safeOffset,
    total: lines.length
  };
}

function buildBlockLines(title: string, value: string | undefined, wrapWidth: number): string[] {
  const wrapped = wrapLines(toDisplayLines(value), wrapWidth);
  return [title, ...wrapped];
}

function scrollStep(delta: number, page = false): number {
  return page ? delta * 8 : delta;
}

function ClearSurface(props: {
  width: number;
  height: number;
}): React.JSX.Element {
  const row = " ".repeat(Math.max(1, props.width));
  return (
    <Box width={props.width} height={props.height} flexDirection="column">
      {Array.from({ length: Math.max(1, props.height) }, (_, index) => (
        <Text key={`surface-${index}`}>
          {row}
        </Text>
      ))}
    </Box>
  );
}

function Panel(props: {
  title: string;
  children: React.ReactNode;
  borderColor?: string;
  width?: string | number;
  marginLeft?: number;
  height?: number;
  flexGrow?: number;
  paddingX?: number;
  hotkeyLabel?: string;
}): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={props.borderColor ?? "gray"}
      paddingX={props.paddingX ?? 1}
      flexDirection="column"
      width={props.width}
      marginLeft={props.marginLeft}
      height={props.height}
      flexGrow={props.flexGrow}
    >
      <Box flexDirection="row">
        <Text color={props.borderColor ?? "gray"}>{props.title}</Text>
        <Box flexGrow={1} />
        {props.hotkeyLabel ? <Text color="gray">[{props.hotkeyLabel}]</Text> : null}
      </Box>
      <Box flexDirection="column" flexGrow={1}>{props.children}</Box>
    </Box>
  );
}

function MetricCard(props: { label: string; value: string; color?: string; marginLeft?: number }): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={props.color ?? "gray"}
      paddingX={1}
      flexDirection="column"
      marginLeft={props.marginLeft}
      minWidth={16}
    >
      <Text color="gray">{props.label}</Text>
      <Text color={props.color}>{props.value}</Text>
    </Box>
  );
}

function TextBlock(props: {
  title: string;
  value?: string;
  expanded: boolean;
  color?: string;
  maxLines?: number;
  wrapWidth?: number;
}): React.JSX.Element {
  const rawLines = toDisplayLines(props.value);
  const wrappedLines = props.wrapWidth ? wrapLines(rawLines, props.wrapWidth) : rawLines;
  const lines = clipLines(wrappedLines, props.maxLines ?? 10, props.expanded);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={props.color ?? "cyan"}>{props.title}</Text>
      {lines.map((line, index) => (
        <Text key={`${props.title}-${index}`} color={props.color === "red" ? "red" : undefined}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function HistoryView(props: {
  runs: HistoryRunSummary[];
  leaderboard: HistoryLeaderboardRow[];
  selectedRun?: HistoryRunDetail;
  matrixResults: MatrixHistoryResultSummary[];
  selectedMatrixResult?: MatrixHistoryResultSummary;
  attempts: MatrixHistoryAttemptDetail[];
  headTurns: HeadToHeadHistoryTurnDetail[];
  selectedHeadTurn?: HeadToHeadHistoryTurnDetail;
  runIndex: number;
  resultIndex: number;
  focusPane: HistoryFocusPane;
  expandedText: boolean;
  contentHeight: number;
  contentWidth: number;
  muted?: boolean;
}): React.JSX.Element {
  const topHeight = Math.max(12, Math.floor((props.contentHeight - 1) * 0.42));
  const bottomHeight = Math.max(props.contentHeight - topHeight - 1, 12);
  const selectedRunMode = props.selectedRun?.mode;
  const detailTitle = selectedRunMode === "head-to-head" ? "Turn Detail" : "Match Detail";
  const detailWrapWidth = Math.max(24, Math.floor(props.contentWidth * 0.56) - 8);
  const historyLeaderboardNameWidth = Math.max(
    8,
    Math.min(
      20,
      Math.max(...props.leaderboard.map((row) => row.name.length), 8),
      Math.floor(props.contentWidth * 0.24)
    )
  );

  return (
    <Box flexDirection="column" height={props.contentHeight} flexGrow={1}>
      <Box flexDirection="row" height={topHeight}>
        <Box width="44%" flexDirection="column">
          <Panel title={props.focusPane === "runs" ? "Runs *" : "Runs"} borderColor={uiColor(props.focusPane === "runs" ? "cyan" : "gray", Boolean(props.muted))} width="100%" height={topHeight}>
            {props.runs.length === 0 ? (
              <Text color="gray">No saved runs found in this database.</Text>
            ) : (
              props.runs.slice(0, Math.max(1, topHeight - 4)).map((run, index) => {
                const selected = index === clampIndex(props.runIndex, props.runs.length);
                return (
                  <Text key={run.runId} color={selected ? "cyan" : undefined}>
                    {selected ? ">" : " "} {run.mode} {run.status} {run.startedAt.slice(0, 19).replace("T", " ")} L{run.leakCount} D{run.defendedCount} E{run.errorCount}
                  </Text>
                );
              })
            )}
          </Panel>
        </Box>

        <Box width="56%" marginLeft={1} flexDirection="column">
          <Panel title="Leaderboard" borderColor={uiColor("yellow", Boolean(props.muted))} width="100%" height={topHeight}>
            <Text>{`${"Model".padEnd(historyLeaderboardNameWidth)}  ${"Attack".padEnd(16)}  Defense`}</Text>
            <Text color="gray">{`${"-".repeat(historyLeaderboardNameWidth)}  ${"-".repeat(16)}  ${"-".repeat(16)}`}</Text>
            {props.leaderboard.slice(0, Math.max(1, topHeight - 5)).map((row) => (
              <Text key={`history-leader-${row.name}`}>
                {`${compactName(row.name, historyLeaderboardNameWidth)}  ${formatCountPercent(row.attackLeaks, row.attackCells).padEnd(16, " ")}  ${formatCountPercent(defenseSafeCount(row), row.defenseCells)}`}
              </Text>
            ))}
          </Panel>
        </Box>
      </Box>

      <Box flexDirection="row" height={bottomHeight}>
        <Box width="44%" flexDirection="column">
          <Panel title={props.focusPane === "results" ? "Results *" : "Results"} borderColor={uiColor(props.focusPane === "results" ? "cyan" : "gray", Boolean(props.muted))} width="100%" height={bottomHeight}>
            {!props.selectedRun ? (
              <Text color="gray">Select a run to inspect saved results.</Text>
            ) : props.selectedRun.mode === "matrix" ? (
              props.matrixResults.length === 0 ? (
                <Text color="gray">No matrix results saved for this run.</Text>
              ) : (
                props.matrixResults.slice(0, Math.max(1, bottomHeight - 4)).map((result, index) => {
                  const selected = index === clampIndex(props.resultIndex, props.matrixResults.length);
                  return (
                    <Text key={`${result.attackerName}-${result.defenderName}`} color={selected ? "cyan" : statusColor(result.status)}>
                      {selected ? ">" : " "} {result.attackerName} {"->"} {result.defenderName} [{titleCaseStatus(result.status)}] x{result.attempts}
                    </Text>
                  );
                })
              )
            ) : props.headTurns.length === 0 ? (
              <Text color="gray">No head-to-head turns saved for this run.</Text>
            ) : (
              props.headTurns.slice(0, Math.max(1, bottomHeight - 4)).map((turn, index) => {
                const selected = index === clampIndex(props.resultIndex, props.headTurns.length);
                return (
                  <Text key={`${turn.roundNumber}-${turn.actorName}-${turn.phase}-${index}`} color={selected ? "cyan" : statusColor(turn.status)}>
                    {selected ? ">" : " "} [r{turn.roundNumber}] {turn.actorName} {turn.phase} {"->"} {turn.targetName} [{titleCaseStatus(turn.status)}]
                  </Text>
                );
              })
            )}
          </Panel>
        </Box>

        <Box width="56%" marginLeft={1} flexDirection="column">
          <Panel title={props.focusPane === "details" ? `${detailTitle} *` : detailTitle} borderColor={uiColor("cyan", Boolean(props.muted))} width="100%" height={bottomHeight}>
            {!props.selectedRun ? (
              <Text color="gray">Select a saved run first.</Text>
            ) : (
              <>
                <Text color="cyan">{props.selectedRun.runId}</Text>
                <Text color="gray">
                  {props.selectedRun.mode} | {props.selectedRun.status} | conc {props.selectedRun.concurrency} | tokens {props.selectedRun.maxTokens}
                </Text>
                {props.selectedRun.mode === "matrix" ? (
                  !props.selectedMatrixResult ? (
                    <Text color="gray">Select a matrix result to inspect attempts.</Text>
                  ) : (
                    <>
                      <Text color={statusColor(props.selectedMatrixResult.status)}>
                        {props.selectedMatrixResult.attackerName} {"->"} {props.selectedMatrixResult.defenderName} | {titleCaseStatus(props.selectedMatrixResult.status)}
                      </Text>
                      {props.attempts.map((attempt) => (
                        <Box key={`history-attempt-${attempt.attemptNumber}`} flexDirection="column" marginTop={1}>
                          <Text color="gray">Attempt {attempt.attemptNumber} | {titleCaseStatus(attempt.status)}</Text>
                          <TextBlock title="Attack Prompt" value={attempt.attackPrompt} expanded={props.expandedText} maxLines={8} wrapWidth={detailWrapWidth} />
                          <TextBlock title="Attack Message" value={attempt.attackMessage} expanded={props.expandedText} maxLines={6} wrapWidth={detailWrapWidth} />
                          <TextBlock title="Defense Prompt" value={attempt.defensePrompt} expanded={props.expandedText} maxLines={8} wrapWidth={detailWrapWidth} />
                          <TextBlock title={attempt.status === "error" ? "Error" : "Defense Response"} value={attempt.defenseResponse || attempt.errorText || ""} expanded={props.expandedText} color={attempt.status === "error" ? "red" : "cyan"} maxLines={8} wrapWidth={detailWrapWidth} />
                        </Box>
                      ))}
                    </>
                  )
                ) : (
                  !props.selectedHeadTurn ? (
                    <Text color="gray">Select a turn to inspect prompt and response.</Text>
                  ) : (
                    <>
                      <Text color={statusColor(props.selectedHeadTurn.status)}>
                        Round {props.selectedHeadTurn.roundNumber} | {props.selectedHeadTurn.actorName} {props.selectedHeadTurn.phase} {"->"} {props.selectedHeadTurn.targetName} | {titleCaseStatus(props.selectedHeadTurn.status)}
                      </Text>
                      <TextBlock title="Prompt" value={props.selectedHeadTurn.promptText} expanded={props.expandedText} maxLines={12} wrapWidth={detailWrapWidth} />
                      <TextBlock title={props.selectedHeadTurn.status === "error" ? "Error" : "Response"} value={props.selectedHeadTurn.responseText || props.selectedHeadTurn.errorText || ""} expanded={props.expandedText} color={props.selectedHeadTurn.status === "error" ? "red" : "cyan"} maxLines={12} wrapWidth={detailWrapWidth} />
                    </>
                  )
                )}
              </>
            )}
          </Panel>
        </Box>
      </Box>
    </Box>
  );
}

function MatrixGrid(props: {
  models: ResolvedModel[];
  progress?: MatrixProgressEvent;
  selectedRow: number;
  selectedColumn: number;
  contentWidth: number;
}): React.JSX.Element {
  const totalWidth = Math.max(36, props.contentWidth);
  const maxRowLabelWidth = Math.max(...props.models.map((model) => model.name.length));
  const rowLabelWidth = Math.max(8, Math.min(14, maxRowLabelWidth, Math.floor(totalWidth * 0.22)));
  const separatorWidth = Math.max(0, props.models.length - 1);
  const availableForColumns = Math.max(props.models.length * 3, totalWidth - rowLabelWidth - 1 - separatorWidth);
  const columnWidth = Math.max(3, Math.floor(availableForColumns / props.models.length));
  const headerCells = props.models.map((model) =>
    model.name.length <= columnWidth ? model.name.padEnd(columnWidth, " ") : compactHeaderName(model.name, columnWidth)
  );
  const dividerCells = props.models.map(() => "-".repeat(columnWidth));

  return (
    <Box flexDirection="column">
      <Text>
        {`${"Atk/Def".padEnd(rowLabelWidth)} `}
        {headerCells.join(" ")}
      </Text>
      <Text color="gray">
        {"-".repeat(rowLabelWidth)}
        {" "}
        {dividerCells.join(" ")}
      </Text>
      {props.models.map((attacker, rowIndex) => (
        <Box key={`row-${attacker.name}`} flexDirection="row">
          <Text color={rowIndex === props.selectedRow ? "cyan" : "gray"}>
            {compactName(attacker.name, rowLabelWidth)}
          </Text>
          <Text> </Text>
          {props.models.map((defender, columnIndex) => {
            const selected = rowIndex === props.selectedRow && columnIndex === props.selectedColumn;
            const status = props.progress?.grid[`${attacker.name}::${defender.name}`];
            return (
              <Text
                key={`cell-${attacker.name}-${defender.name}`}
                color={selected ? "black" : statusColor(status)}
                backgroundColor={selected ? statusColor(status) : undefined}
              >
                {` ${statusChar(status)} `.padEnd(columnWidth, " ")}
              </Text>
            );
          }).reduce<React.JSX.Element[]>((cells, cell, index) => {
            if (index > 0) {
              cells.push(<Text key={`sep-${attacker.name}-${index}`}> </Text>);
            }
            cells.push(cell);
            return cells;
          }, [])}
        </Box>
      ))}
    </Box>
  );
}

function MatrixView(props: {
  models: ResolvedModel[];
  progress?: MatrixProgressEvent;
  history: MatrixResult[];
  leaderboard: HistoryLeaderboardRow[];
  title: string;
  selectedRow: number;
  selectedColumn: number;
  focusPane: MatrixFocusPane;
  promptScrollOffset: number;
  messageScrollOffset: number;
  expandedText: boolean;
  contentHeight: number;
  contentWidth: number;
  muted?: boolean;
}): React.JSX.Element {
  const attacker = props.models[clampIndex(props.selectedRow, props.models.length)];
  const defender = props.models[clampIndex(props.selectedColumn, props.models.length)];
  const cellKey = attacker && defender ? `${attacker.name}::${defender.name}` : undefined;
  const liveCell = cellKey ? props.progress?.cells[cellKey] : undefined;
  const selectedCellResult =
    attacker && defender
      ? props.history.find((entry) => entry.attacker === attacker.name && entry.defender === defender.name)
      : undefined;
  const activeResult: MatrixCellState | MatrixResult | undefined = liveCell ?? selectedCellResult;
  const activeAttempt = activeResult?.attempts[activeResult.attempts.length - 1];
  const completed = props.progress?.completed ?? 0;
  const total = props.progress?.total ?? props.models.length * props.models.length;
  const currentModelNames = new Set(props.models.map((model) => model.name));
  const currentLeaderboard = props.leaderboard.filter((row) => currentModelNames.has(row.name));
  const attackColumnValues = currentLeaderboard.map((row) => formatCountPercent(row.attackLeaks, row.attackCells));
  const defenseColumnValues = currentLeaderboard.map((row) => formatCountPercent(defenseSafeCount(row), row.defenseCells));
  const matrixContentLines = props.models.length + 2;
  const leaderboardContentLines = currentLeaderboard.length + 2;
  const topHeight = panelHeightForContent(Math.max(matrixContentLines, leaderboardContentLines));
  const bottomHeight = Math.max(props.contentHeight - topHeight, panelHeightForContent(8));
  const halfPaneWidth = Math.max(40, Math.floor((props.contentWidth - 1) / 2));
  const topPaneInnerWidth = Math.max(24, halfPaneWidth - 4);
  const paneWrapWidth = Math.max(32, halfPaneWidth - 6);
  const detailVisibleLines = Math.max(6, bottomHeight - PANEL_FRAME_ROWS - DETAIL_FOOTER_ROWS);
  const leaderboardNameWidth = Math.max(
    8,
    Math.min(
      20,
      Math.max(...props.models.map((model) => model.name.length)),
      Math.floor(topPaneInnerWidth * 0.42)
    )
  );
  const leaderboardAttackWidth = Math.max(16, "Attack".length, ...attackColumnValues.map((value) => value.length));
  const leaderboardDefenseWidth = Math.max(16, "Defense".length, ...defenseColumnValues.map((value) => value.length));
  const promptLines = !activeResult
    ? [
      "Select a live or completed matrix cell to inspect prompts."
    ]
    : [
      `${activeResult.attacker} -> ${activeResult.defender} | ${titleCaseStatus(activeResult.status)}`,
      "",
      ...buildBlockLines("Attack Prompt", activeAttempt?.attackPrompt ?? activeResult.attackPrompt, paneWrapWidth),
      "",
      ...buildBlockLines("Defense Prompt", activeAttempt?.defensePrompt ?? activeResult.defensePrompt, paneWrapWidth)
    ];
  const promptWindow = scrollWindow(promptLines, props.promptScrollOffset, detailVisibleLines);
  const messageLines = !activeResult
    ? [
      "Select a live or completed matrix cell to inspect messages."
    ]
    : activeResult.attempts.length === 0
      ? [
        `${activeResult.attacker} -> ${activeResult.defender} | ${titleCaseStatus(activeResult.status)}`,
        "Waiting for first message..."
      ]
      : [
        `${activeResult.attacker} -> ${activeResult.defender} | ${titleCaseStatus(activeResult.status)}`,
        ...activeResult.attempts.flatMap((attempt, index) => [
          `Attempt ${attempt.attemptNumber} | ${titleCaseStatus(attempt.status)}`,
          "",
          ...buildBlockLines("Attack", attempt.attackMessage, paneWrapWidth),
          "",
          ...buildBlockLines(attempt.status === "error" ? "Error" : "Defense", attempt.defenderResponse || attempt.errorText, paneWrapWidth),
          ...(index === activeResult.attempts.length - 1 ? [] : [""])
        ])
      ];
  const messageWindow = scrollWindow(messageLines, props.messageScrollOffset, detailVisibleLines);
  const promptMoreLines = Math.max(0, promptWindow.total - (promptWindow.offset + promptWindow.lines.length));
  const messageMoreLines = Math.max(0, messageWindow.total - (messageWindow.offset + messageWindow.lines.length));

  return (
    <Box flexDirection="column" height={props.contentHeight} flexGrow={1}>
      <Box flexDirection="row" height={topHeight}>
        <Box width="50%" flexDirection="column">
          <Panel
            title={props.focusPane === "matrix" ? `${props.title} *` : props.title}
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="1"
          >
            <MatrixGrid
              models={props.models}
              progress={props.progress}
              selectedRow={props.selectedRow}
              selectedColumn={props.selectedColumn}
              contentWidth={topPaneInnerWidth}
            />
          </Panel>
        </Box>

        <Box width="50%" marginLeft={1} flexDirection="column">
          <Panel
            title={props.focusPane === "leaderboard" ? "Leaderboard *" : "Leaderboard"}
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="2"
          >
            <Text>{`${"Model".padEnd(leaderboardNameWidth)}  ${rightAlign("Attack", leaderboardAttackWidth)}  ${rightAlign("Defense", leaderboardDefenseWidth)}`}</Text>
            <Text color="gray">
              {`${"-".repeat(leaderboardNameWidth)}  ${"-".repeat(leaderboardAttackWidth)}  ${"-".repeat(leaderboardDefenseWidth)}`}
            </Text>
            {currentLeaderboard.map((row, index) => (
              <Text
                key={`leader-${row.name}`}
                color={activeResult && (activeResult.attacker === row.name || activeResult.defender === row.name) ? "cyan" : undefined}
              >
                {`${compactName(row.name, leaderboardNameWidth)}  ${rightAlign(attackColumnValues[index] ?? "-", leaderboardAttackWidth)}  ${rightAlign(defenseColumnValues[index] ?? "-", leaderboardDefenseWidth)}`}
              </Text>
            ))}
          </Panel>
        </Box>
      </Box>

      <Box flexDirection="row" height={bottomHeight}>
        <Box width="50%" flexDirection="column">
          <Panel
            title={
              props.focusPane === "prompts"
                ? `Prompts * ${promptWindow.total === 0 ? "0/0" : `${promptWindow.offset + 1}-${Math.min(promptWindow.offset + promptWindow.lines.length, promptWindow.total)}/${promptWindow.total}`}`
                : `Prompts ${promptWindow.total === 0 ? "0/0" : `${promptWindow.offset + 1}-${Math.min(promptWindow.offset + promptWindow.lines.length, promptWindow.total)}/${promptWindow.total}`}`
            }
            borderColor={uiColor(detailPaneBorderColor(activeResult?.status), Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="3"
          >
            <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
              <Box flexDirection="column">
                {promptWindow.lines.map((line, index) => (
                  <Text
                    key={`prompt-line-${index}`}
                    color={
                      line === "Attack Prompt" || line === "Defense Prompt"
                        ? "cyan"
                        : !activeResult
                          ? "gray"
                          : index === 0
                            ? statusColor(activeResult.status)
                            : undefined
                    }
                  >
                    {line}
                  </Text>
                ))}
              </Box>
              <Text color="gray">
                {promptMoreLines > 0
                  ? `${promptMoreLines} more lines. 3 focuses, j/k scroll.`
                  : "End of pane. 3 focuses, j/k scroll."}
              </Text>
            </Box>
          </Panel>
        </Box>

        <Box width="50%" marginLeft={1} flexDirection="column">
          <Panel
            title={
              props.focusPane === "messages"
                ? `Messages * ${messageWindow.total === 0 ? "0/0" : `${messageWindow.offset + 1}-${Math.min(messageWindow.offset + messageWindow.lines.length, messageWindow.total)}/${messageWindow.total}`}`
                : `Messages ${messageWindow.total === 0 ? "0/0" : `${messageWindow.offset + 1}-${Math.min(messageWindow.offset + messageWindow.lines.length, messageWindow.total)}/${messageWindow.total}`}`
            }
            borderColor={uiColor(detailPaneBorderColor(activeResult?.status), Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="4"
          >
            <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
              <Box flexDirection="column">
                {messageWindow.lines.map((line, index) => {
                  const isBlockTitle = line === "Attack" || line === "Defense" || line === "Error";
                  const isAttemptLine = line.startsWith("Attempt ");
                  const isHeaderLine = activeResult ? index === 0 && line.startsWith(`${activeResult.attacker} -> ${activeResult.defender}`) : false;
                  return (
                    <Text
                      key={`message-line-${index}`}
                      color={isBlockTitle ? "cyan" : isAttemptLine ? "gray" : isHeaderLine ? statusColor(activeResult?.status) : undefined}
                    >
                      {line}
                    </Text>
                  );
                })}
              </Box>
              <Text color="gray">
                {messageMoreLines > 0
                  ? `${messageMoreLines} more lines. 4 focuses, j/k scroll.`
                  : "End of pane. 4 focuses, j/k scroll."}
              </Text>
            </Box>
          </Panel>
        </Box>
      </Box>
    </Box>
  );
}

function HeadToHeadView(props: {
  left: ResolvedModel;
  right: ResolvedModel;
  rounds: number;
  progress?: HeadToHeadProgressEvent;
  result?: HeadToHeadResult;
  turns: HeadToHeadTurn[];
  selectedIndex: number;
  focusPane: HeadFocusPane;
  expandedText: boolean;
  muted?: boolean;
}): React.JSX.Element {
  const totalTurns = props.progress?.totalTurns ?? props.rounds * 4;
  const selectedTurn = props.turns[clampIndex(props.selectedIndex, props.turns.length)];
  const errors = props.turns.filter((turn) => turn.status === "error").length;
  const leaks = props.turns.filter((turn) => turn.status === "leaked").length;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <MetricCard label="Match" value={`${props.left.name} vs ${props.right.name}`} color="cyan" />
        <MetricCard
          label="Progress"
          value={makeProgressBar(props.progress?.completedTurns ?? props.turns.length, totalTurns)}
          color="green"
          marginLeft={1}
        />
        <MetricCard label="Leaks" value={String(leaks)} color="red" marginLeft={1} />
        <MetricCard label="Errors" value={String(errors)} color="magenta" marginLeft={1} />
        <MetricCard label="Outcome" value={props.result?.outcome ?? props.progress?.outcome ?? "running"} color="yellow" marginLeft={1} />
      </Box>

      <Box flexDirection="row">
        <Panel
          title={props.focusPane === "turns" ? "Turns *" : "Turns"}
          borderColor={uiColor(props.focusPane === "turns" ? "cyan" : "gray", Boolean(props.muted))}
          width="35%"
        >
          {props.turns.length === 0 ? (
            <Text color="gray">Waiting for first turn...</Text>
          ) : (
            props.turns.slice(0, 14).map((turn, index) => {
              const selected = index === clampIndex(props.selectedIndex, props.turns.length);
              return (
                <Text key={`${turn.round}-${turn.actor}-${turn.phase}-${index}`} color={selected ? "cyan" : statusColor(turn.status)}>
                  {selected ? ">" : " "} [r{turn.round}] {turn.actor} {turn.phase} {"->"} {turn.target} [{titleCaseStatus(turn.status)}]
                </Text>
              );
            })
          )}
        </Panel>

        <Panel
          title={props.focusPane === "details" ? "Details *" : "Details"}
          borderColor={uiColor(props.focusPane === "details" ? statusColor(selectedTurn?.status) : "gray", Boolean(props.muted))}
          width="65%"
          marginLeft={1}
        >
          {!selectedTurn ? (
            <Text color="gray">No turn selected yet.</Text>
          ) : (
            <>
              <Text color={statusColor(selectedTurn.status)}>
                Round {selectedTurn.round} | {selectedTurn.actor} {selectedTurn.phase} {"->"} {selectedTurn.target} | {titleCaseStatus(selectedTurn.status)}
              </Text>
              {selectedTurn.leakedSecretOwner ? <Text color="red">Leaked secret owner: {selectedTurn.leakedSecretOwner}</Text> : null}
              <TextBlock title="Prompt" value={selectedTurn.prompt} expanded={props.expandedText} maxLines={14} />
              <TextBlock
                title={selectedTurn.status === "error" ? "Error" : "Response"}
                value={selectedTurn.text || selectedTurn.errorText}
                color={selectedTurn.status === "error" ? "red" : "cyan"}
                expanded={props.expandedText}
                maxLines={14}
              />
            </>
          )}
        </Panel>
      </Box>
    </Box>
  );
}

export function App(props: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState(() => ({
    rows: stdout.rows ?? 40,
    columns: stdout.columns ?? 120
  }));
  const stdoutRows = terminalSize.rows;
  const stdoutColumns = terminalSize.columns;
  const viewportRows = Math.max(stdoutRows, 24);
  const dbClosedRef = useRef(false);
  const cancelControllerRef = useRef(props.mode === "history" ? undefined : new AbortController());
  const [error, setError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const [expandedText, setExpandedText] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [exitAfterCancel, setExitAfterCancel] = useState(false);
  const [headFocusPane, setHeadFocusPane] = useState<HeadFocusPane>("turns");
  const [matrixProgress, setMatrixProgress] = useState<MatrixProgressEvent>();
  const [matrixHistory, setMatrixHistory] = useState<MatrixResult[]>([]);
  const [matrixSelectedRow, setMatrixSelectedRow] = useState(0);
  const [matrixSelectedColumn, setMatrixSelectedColumn] = useState(0);
  const [matrixFocusPane, setMatrixFocusPane] = useState<MatrixFocusPane>("matrix");
  const [promptScrollOffset, setPromptScrollOffset] = useState(0);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  const [headProgress, setHeadProgress] = useState<HeadToHeadProgressEvent>();
  const [headResult, setHeadResult] = useState<HeadToHeadResult>();
  const [headTurns, setHeadTurns] = useState<HeadToHeadTurn[]>([]);
  const [headSelectedIndex, setHeadSelectedIndex] = useState(0);
  const [historyRuns, setHistoryRuns] = useState<HistoryRunSummary[]>([]);
  const [historyLeaderboard, setHistoryLeaderboard] = useState<HistoryLeaderboardRow[]>([]);
  const [matrixLeaderboard, setMatrixLeaderboard] = useState<HistoryLeaderboardRow[]>([]);
  const [historySelectedRun, setHistorySelectedRun] = useState<HistoryRunDetail>();
  const [historyMatrixResults, setHistoryMatrixResults] = useState<MatrixHistoryResultSummary[]>([]);
  const [historyAttempts, setHistoryAttempts] = useState<MatrixHistoryAttemptDetail[]>([]);
  const [historyHeadTurns, setHistoryHeadTurns] = useState<HeadToHeadHistoryTurnDetail[]>([]);
  const [historyRunIndex, setHistoryRunIndex] = useState(0);
  const [historyResultIndex, setHistoryResultIndex] = useState(0);
  const [historyFocusPane, setHistoryFocusPane] = useState<HistoryFocusPane>("runs");

  const closeDb = (): void => {
    if (!dbClosedRef.current) {
      const db = props.mode === "history" ? props.db : props.context.db;
      db.close();
      dbClosedRef.current = true;
    }
  };

  useEffect(() => {
    const handleResize = (): void => {
      setTerminalSize({
        rows: stdout.rows ?? 40,
        columns: stdout.columns ?? 120
      });
    };

    handleResize();
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  useInput((input, key) => {
    if (confirmQuit) {
      if (key.escape || input.toLowerCase() === "n") {
        setConfirmQuit(false);
        return;
      }
      if (key.return || input.toLowerCase() === "y") {
        setConfirmQuit(false);
        setExitAfterCancel(true);
        setCancelling(true);
        cancelControllerRef.current?.abort();
        return;
      }
      return;
    }

    if (input === "q") {
      if (props.mode === "history") {
        closeDb();
        exit();
        return;
      }
      if (!completed && !error && !cancelling) {
        setConfirmQuit(true);
        return;
      }
      closeDb();
      exit();
      return;
    }

    if (key.escape) {
      if (completed || error || cancelled) {
        closeDb();
        exit();
      }
      return;
    }

    if (input === "v") {
      setExpandedText((current) => !current);
      return;
    }

    if (props.mode === "history") {
      if (key.tab || input === "l") {
        setHistoryFocusPane((current) => current === "runs" ? "results" : current === "results" ? "details" : "runs");
        return;
      }
      if (input === "h") {
        setHistoryFocusPane((current) => current === "details" ? "results" : current === "results" ? "runs" : "details");
        return;
      }
      if (historyFocusPane === "runs") {
        if (key.upArrow || input === "k") {
          setHistoryRunIndex((current) => Math.max(0, current - 1));
          setHistoryResultIndex(0);
          return;
        }
        if (key.downArrow || input === "j") {
          setHistoryRunIndex((current) => Math.min(Math.max(0, historyRuns.length - 1), current + 1));
          setHistoryResultIndex(0);
          return;
        }
      }
      if (historyFocusPane === "results") {
        const resultCount = historySelectedRun?.mode === "matrix" ? historyMatrixResults.length : historyHeadTurns.length;
        if (key.upArrow || input === "k") {
          setHistoryResultIndex((current) => Math.max(0, current - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setHistoryResultIndex((current) => Math.min(Math.max(0, resultCount - 1), current + 1));
          return;
        }
      }
      return;
    }

    if (props.mode === "matrix") {
      if (input === "1") {
        setMatrixFocusPane("matrix");
        return;
      }
      if (input === "2") {
        setMatrixFocusPane("leaderboard");
        return;
      }
      if (input === "3") {
        setMatrixFocusPane("prompts");
        return;
      }
      if (input === "4") {
        setMatrixFocusPane("messages");
        return;
      }
      if (key.tab) {
        setMatrixFocusPane((current) =>
          current === "matrix"
            ? "leaderboard"
            : current === "leaderboard"
              ? "prompts"
              : current === "prompts"
                ? "messages"
                : "matrix"
        );
        return;
      }

      if (matrixFocusPane === "matrix") {
        if (key.leftArrow || input === "h") {
          setMatrixSelectedColumn((current) => Math.max(0, current - 1));
          return;
        }
        if (key.rightArrow || input === "l") {
          setMatrixSelectedColumn((current) => Math.min(props.models.length - 1, current + 1));
          return;
        }
        if (key.upArrow || input === "k") {
          setMatrixSelectedRow((current) => Math.max(0, current - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setMatrixSelectedRow((current) => Math.min(props.models.length - 1, current + 1));
          return;
        }
        return;
      }

      if (matrixFocusPane === "leaderboard") {
        if (input === "h") {
          setMatrixFocusPane("matrix");
          return;
        }
        if (input === "l") {
          setMatrixFocusPane("prompts");
          return;
        }
        return;
      }

      if (input === "h") {
        setMatrixFocusPane((current) =>
          current === "messages"
            ? "prompts"
            : current === "prompts"
              ? "leaderboard"
              : "matrix"
        );
        return;
      }
      if (input === "l") {
        setMatrixFocusPane((current) =>
          current === "matrix"
            ? "leaderboard"
            : current === "leaderboard"
              ? "prompts"
              : "messages"
        );
        return;
      }
      const up = key.upArrow || input === "k" || input === "u" || key.pageUp;
      const down = key.downArrow || input === "j" || input === "d" || key.pageDown;
      if (up) {
        const amount = scrollStep(-1, Boolean(key.pageUp || input === "u"));
        if (matrixFocusPane === "prompts") {
          setPromptScrollOffset((current) => Math.max(0, current + amount));
        } else {
          setMessageScrollOffset((current) => Math.max(0, current + amount));
        }
        return;
      }
      if (down) {
        const amount = scrollStep(1, Boolean(key.pageDown || input === "d"));
        if (matrixFocusPane === "prompts") {
          setPromptScrollOffset((current) => current + amount);
        } else {
          setMessageScrollOffset((current) => current + amount);
        }
        return;
      }

      return;
    }

    if (key.tab || input === "h" || input === "l") {
      setHeadFocusPane((current) => (current === "turns" ? "details" : "turns"));
      return;
    }

    if (headFocusPane === "turns") {
      if (key.upArrow || input === "k") {
        setHeadSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setHeadSelectedIndex((current) => current + 1);
      }
    }
  });

  useEffect(() => {
    setPromptScrollOffset(0);
    setMessageScrollOffset(0);
  }, [matrixSelectedColumn, matrixSelectedRow]);

  useEffect(() => {
    if (!exitAfterCancel) {
      return;
    }

    if (!completed && !error && !cancelled) {
      return;
    }

    closeDb();
    exit();
  }, [cancelled, completed, error, exit, exitAfterCancel]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (props.mode === "history") {
          const runs = props.db.listHistoryRuns(100);
          const leaderboard = props.db.listHistoryLeaderboard(20);
          if (cancelled) {
            return;
          }
          setHistoryRuns(runs);
          setHistoryLeaderboard(leaderboard);
          setCompleted(true);
          return;
        }

        if (props.mode === "matrix") {
          setMatrixLeaderboard(props.context.db.listHistoryLeaderboard(20));
          const result = await runMatrix({
            context: props.context,
            models: props.models,
            signal: cancelControllerRef.current?.signal,
            onProgress: (event) => {
              if (cancelled) {
                return;
              }
              setMatrixProgress(event);
              if (event.latest) {
                setMatrixHistory((current) => [event.latest!, ...current]);
              }
              setMatrixLeaderboard(props.context.db.listHistoryLeaderboard(20));
            }
          });
          if (!cancelled) {
            setMatrixHistory([...result.results].reverse());
            setMatrixLeaderboard(props.context.db.listHistoryLeaderboard(20));
            setCancelled(result.status === "cancelled");
            setCompleted(true);
          }
        } else {
          if (!props.left || !props.right) {
            throw new Error("Head-to-head mode requires left and right models.");
          }
          const result = await runHeadToHead({
            context: props.context,
            left: props.left,
            right: props.right,
            rounds: props.runtimeOptions.headToHeadRounds,
            signal: cancelControllerRef.current?.signal,
            onProgress: (event) => {
              if (cancelled) {
                return;
              }
              setHeadProgress(event);
              if (event.latest) {
                setHeadTurns((current) => [event.latest!, ...current]);
              }
            }
          });
          if (!cancelled) {
            setHeadResult(result);
            setHeadTurns([...result.turns].reverse());
            setCancelled(result.status === "cancelled");
            setCompleted(true);
          }
        }
      } catch (runError: unknown) {
        const message = runError instanceof Error ? runError.message : String(runError);
        if (!cancelled) {
          setError(message);
          setCompleted(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      closeDb();
    };
  }, [props]);

  useEffect(() => {
    if (props.mode !== "history") {
      return;
    }
    const selectedRunSummary = historyRuns[clampIndex(historyRunIndex, historyRuns.length)];
    if (!selectedRunSummary) {
      setHistorySelectedRun(undefined);
      setHistoryMatrixResults([]);
      setHistoryAttempts([]);
      setHistoryHeadTurns([]);
      return;
    }

    const detail = props.db.getHistoryRunDetail(selectedRunSummary.runId);
    setHistorySelectedRun(detail);

    if (!detail) {
      setHistoryMatrixResults([]);
      setHistoryAttempts([]);
      setHistoryHeadTurns([]);
      return;
    }

    if (detail.mode === "matrix") {
      const results = props.db.getMatrixResultsForRun(detail.runId);
      setHistoryMatrixResults(results);
      setHistoryHeadTurns([]);
      const selectedResult = results[clampIndex(historyResultIndex, results.length)];
      if (selectedResult) {
        setHistoryAttempts(props.db.getMatrixAttemptsForPair(detail.runId, selectedResult.attackerName, selectedResult.defenderName));
      } else {
        setHistoryAttempts([]);
      }
      return;
    }

    const turns = props.db.getHeadToHeadTurnsForRun(detail.runId);
    setHistoryHeadTurns(turns);
    setHistoryMatrixResults([]);
    setHistoryAttempts([]);
  }, [props, historyRuns, historyRunIndex, historyResultIndex]);

  const appState = error ? "failed" : cancelling && !completed ? "cancelling" : cancelled ? "cancelled" : completed ? "complete" : "running";
  const matrixRunCost =
    matrixHistory.reduce((total, result) => total + sumAttemptCosts(result.attempts), 0) +
    Object.values(matrixProgress?.cells ?? {})
      .filter((cell) => cell.status === "running")
      .reduce((total, cell) => total + sumAttemptCosts(cell.attempts), 0);
  const statusText =
    appState === "complete"
      ? "COMPLETE | inspect panes, then press q to quit."
      : appState === "cancelled"
        ? "CANCELLED | partial results were saved. Press q to quit."
        : appState === "failed"
          ? "FAILED"
          : appState === "cancelling"
            ? "CANCELLING"
            : "RUNNING";
  const topBarHeight = props.mode === "matrix" ? 0 : 1;
  const errorHeight = error ? panelHeightForContent(1) : 0;
  const bodyHeight = Math.max(16, viewportRows - topBarHeight - errorHeight);
  const modalOpen = confirmQuit && !completed;
  const topBarLine = useMemo(() => {
    if (props.mode === "history") {
      return truncateLine(`AdversarialBench History db=${props.dbPath}`, stdoutColumns);
    }

    if (props.mode === "matrix") {
      const completedCount = matrixProgress?.completed ?? 0;
      const totalCount = matrixProgress?.total ?? props.models.length * props.models.length;
      return truncateLine(
        `AdversarialBench Matrix ${completedCount}/${totalCount} msgs=${props.runtimeOptions.attackerMessages} conc=${props.runtimeOptions.concurrency}`,
        stdoutColumns
      );
    }

    const completedTurns = headProgress?.completedTurns ?? headTurns.length;
    const totalTurns = headProgress?.totalTurns ?? props.runtimeOptions.headToHeadRounds * 4;
    return truncateLine(
      `AdversarialBench Head-to-Head ${completedTurns}/${totalTurns} rounds=${props.runtimeOptions.headToHeadRounds} conc=${props.runtimeOptions.concurrency}`,
      stdoutColumns
    );
  }, [
    headProgress?.completedTurns,
    headProgress?.totalTurns,
    headTurns.length,
    matrixProgress?.completed,
    matrixProgress?.total,
    props,
    stdoutColumns
  ]);

  return (
    <Box flexDirection="column" width={stdoutColumns} height={viewportRows}>
      {topBarHeight > 0 ? (
        <Text color={uiColor(appState === "complete" ? "green" : appState === "failed" ? "red" : appState === "cancelled" ? "yellow" : "cyan", modalOpen)}>
          {topBarLine}
        </Text>
      ) : null}

      {error ? (
        <Box>
          <Panel title="Runtime Error" borderColor={uiColor("red", modalOpen)} width="100%" height={errorHeight}>
            <Text color={uiColor("red", modalOpen)}>{error}</Text>
          </Panel>
        </Box>
      ) : null}

      <Box flexGrow={1}>
        {props.mode === "history" ? (
          <HistoryView
            runs={historyRuns}
            leaderboard={historyLeaderboard}
            selectedRun={historySelectedRun}
            matrixResults={historyMatrixResults}
            selectedMatrixResult={historyMatrixResults[clampIndex(historyResultIndex, historyMatrixResults.length)]}
            attempts={historyAttempts}
            headTurns={historyHeadTurns}
            selectedHeadTurn={historyHeadTurns[clampIndex(historyResultIndex, historyHeadTurns.length)]}
            runIndex={historyRunIndex}
            resultIndex={historyResultIndex}
            focusPane={historyFocusPane}
            expandedText={expandedText}
            contentHeight={Math.max(bodyHeight, 16)}
            contentWidth={stdoutColumns}
            muted={false}
          />
        ) : props.mode === "matrix" ? (
          <MatrixView
            models={props.models}
            progress={matrixProgress}
            history={matrixHistory}
            leaderboard={matrixLeaderboard}
            title={`AdversarialBench ${matrixProgress?.completed ?? 0}/${matrixProgress?.total ?? props.models.length * props.models.length} msgs=${props.runtimeOptions.attackerMessages} conc=${props.runtimeOptions.concurrency} cost=${formatCost(matrixRunCost)}`}
            selectedRow={matrixSelectedRow}
            selectedColumn={matrixSelectedColumn}
            focusPane={matrixFocusPane}
            promptScrollOffset={promptScrollOffset}
            messageScrollOffset={messageScrollOffset}
            expandedText={expandedText}
            contentHeight={Math.max(bodyHeight, 16)}
            contentWidth={stdoutColumns}
            muted={false}
          />
        ) : props.left && props.right ? (
          <HeadToHeadView
            left={props.left}
            right={props.right}
            rounds={props.runtimeOptions.headToHeadRounds}
            progress={headProgress}
            result={headResult}
            turns={headTurns}
            selectedIndex={headSelectedIndex}
            focusPane={headFocusPane}
            expandedText={expandedText}
            muted={false}
          />
        ) : null}
      </Box>

      {modalOpen ? (
        <Box
          position="absolute"
          width={stdoutColumns}
          height={viewportRows}
          justifyContent="center"
          alignItems="center"
        >
          <Box width={42} height={7}>
            <Box position="absolute">
              <ClearSurface width={42} height={7} />
            </Box>
            <Box position="absolute" width={42} height={7} flexDirection="column" justifyContent="center" alignItems="center">
              <Text color="white">Exit? [Y/n]</Text>
              <Text color="gray">Save partial results and stop this run.</Text>
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
