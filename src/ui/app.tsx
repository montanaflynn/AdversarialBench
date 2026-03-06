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
  LeakMatrixResultSummary,
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
    mode: "leaks";
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

type HeadFocusPane = "turns" | "summary" | "prompts" | "messages";
type HistoryFocusPane = "runs" | "leaderboard" | "results" | "details";
type MatrixFocusPane = "matrix" | "leaderboard" | "prompts" | "messages";
type LeakFocusPane = "leaks" | "messages";
type LeaderboardLabelMode = "name" | "model";
type HeadToHeadExchange = {
  round: number;
  attacker: string;
  defender: string;
  attackTurn?: HeadToHeadTurn;
  defenseTurn?: HeadToHeadTurn;
  status: MatchStatus;
};

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

function defenseHeldCount(row: HistoryLeaderboardRow): number {
  return Math.max(0, row.defends);
}

function sortLeaderboardRows(rows: HistoryLeaderboardRow[]): HistoryLeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const attackRateA = a.attackCells > 0 ? a.attackLeaks / a.attackCells : 0;
    const attackRateB = b.attackCells > 0 ? b.attackLeaks / b.attackCells : 0;
    if (attackRateB !== attackRateA) {
      return attackRateB - attackRateA;
    }
    if (b.attackLeaks !== a.attackLeaks) {
      return b.attackLeaks - a.attackLeaks;
    }

    const defenseRateA = a.defenseCells > 0 ? defenseHeldCount(a) / a.defenseCells : 0;
    const defenseRateB = b.defenseCells > 0 ? defenseHeldCount(b) / b.defenseCells : 0;
    if (defenseRateB !== defenseRateA) {
      return defenseRateB - defenseRateA;
    }
    if (defenseHeldCount(b) !== defenseHeldCount(a)) {
      return defenseHeldCount(b) - defenseHeldCount(a);
    }
    if (a.errors !== b.errors) {
      return a.errors - b.errors;
    }
    return a.name.localeCompare(b.name);
  });
}

function visibleLeaderboardRows(rows: HistoryLeaderboardRow[]): HistoryLeaderboardRow[] {
  return sortLeaderboardRows(rows.filter((row) => !row.modelRef.startsWith("scripted:")));
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

function formatTokenLimit(maxTokens: number): string {
  return maxTokens > 0 ? String(maxTokens) : "auto";
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

function deriveHeadToHeadExchanges(turns: HeadToHeadTurn[]): HeadToHeadExchange[] {
  const exchanges = new Map<string, HeadToHeadExchange>();
  const order: string[] = [];

  for (const turn of turns) {
    const attacker = turn.phase === "attack" ? turn.actor : turn.target;
    const defender = turn.phase === "attack" ? turn.target : turn.actor;
    const key = `${turn.round}:${attacker}->${defender}`;

    let exchange = exchanges.get(key);
    if (!exchange) {
      exchange = {
        round: turn.round,
        attacker,
        defender,
        status: turn.phase === "attack" ? "running" : turn.status
      };
      exchanges.set(key, exchange);
      order.push(key);
    }

    if (turn.phase === "attack") {
      exchange.attackTurn = turn;
      exchange.status = turn.status === "error" ? "error" : exchange.defenseTurn ? exchange.defenseTurn.status : "running";
    } else {
      exchange.defenseTurn = turn;
      exchange.status = turn.status;
    }
  }

  return order.map((key) => exchanges.get(key)!).filter(Boolean);
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
  hotkeyActive?: boolean;
  hotkeyNote?: React.ReactNode;
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
        {props.hotkeyNote ? <Box marginRight={props.hotkeyLabel ? 1 : 0}>{props.hotkeyNote}</Box> : null}
        {props.hotkeyLabel ? <Text color={props.hotkeyActive ? (props.borderColor ?? "cyan") : "gray"}>[{props.hotkeyLabel}]</Text> : null}
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
  detailScrollOffset: number;
  leaderboardLabelMode: LeaderboardLabelMode;
  expandedText: boolean;
  contentHeight: number;
  contentWidth: number;
  muted?: boolean;
}): React.JSX.Element {
  const topHeight = Math.max(12, Math.floor(props.contentHeight * 0.4));
  const bottomHeight = Math.max(props.contentHeight - topHeight, 12);
  const selectedRunMode = props.selectedRun?.mode;
  const detailTitle = selectedRunMode === "head-to-head" ? "Turn Detail" : "Match Detail";
  const halfPaneWidth = Math.max(40, Math.floor((props.contentWidth - 1) / 2));
  const topPaneInnerWidth = Math.max(24, halfPaneWidth - 4);
  const detailWrapWidth = Math.max(32, halfPaneWidth - 6);
  const listVisibleLines = Math.max(4, topHeight - PANEL_FRAME_ROWS);
  const detailVisibleLines = Math.max(6, bottomHeight - PANEL_FRAME_ROWS - DETAIL_FOOTER_ROWS);
  const displayLeaderboard = visibleLeaderboardRows(props.leaderboard);
  const historyLabelValues = displayLeaderboard.map((row) => props.leaderboardLabelMode === "model" ? row.modelRef : row.name);
  const historyLeaderboardNameWidth = Math.max(
    8,
    Math.min(
      28,
      Math.max(...historyLabelValues.map((value) => value.length), 8),
      Math.floor(topPaneInnerWidth * 0.4)
    )
  );
  const historyAttackWidth = Math.max(16, "Attack".length, ...displayLeaderboard.map((row) => formatCountPercent(row.attackLeaks, row.attackCells).length));
  const historyDefenseWidth = Math.max(16, "Defense".length, ...displayLeaderboard.map((row) => formatCountPercent(defenseHeldCount(row), row.defenseCells).length));

  const selectedRunIndex = clampIndex(props.runIndex, props.runs.length);
  const runsOffset = Math.max(0, Math.min(selectedRunIndex - Math.floor(listVisibleLines / 2), Math.max(0, props.runs.length - listVisibleLines)));
  const visibleRuns = props.runs.slice(runsOffset, runsOffset + listVisibleLines);

  const resultItems = props.selectedRun?.mode === "matrix"
    ? props.matrixResults.map((result) => ({
      key: `${result.attackerName}-${result.defenderName}`,
      color: statusColor(result.status),
      text: `${result.attackerName} -> ${result.defenderName} [${titleCaseStatus(result.status)}] x${result.attempts}`
    }))
    : props.headTurns.map((turn, index) => ({
      key: `${turn.roundNumber}-${turn.actorName}-${turn.phase}-${index}`,
      color: statusColor(turn.status),
      text: `[r${turn.roundNumber}] ${turn.actorName} ${turn.phase} -> ${turn.targetName} [${titleCaseStatus(turn.status)}]`
    }));
  const selectedResultIndex = clampIndex(props.resultIndex, resultItems.length);
  const resultsOffset = Math.max(0, Math.min(selectedResultIndex - Math.floor(detailVisibleLines / 2), Math.max(0, resultItems.length - detailVisibleLines)));
  const visibleResults = resultItems.slice(resultsOffset, resultsOffset + detailVisibleLines);

  const detailLines = !props.selectedRun
    ? ["Select a saved run first."]
    : props.selectedRun.mode === "matrix"
      ? !props.selectedMatrixResult
        ? ["Select a matrix result to inspect saved prompts and messages."]
        : [
          props.selectedRun.runId,
          `${props.selectedRun.mode} | ${props.selectedRun.status} | conc ${props.selectedRun.concurrency} | tokens ${formatTokenLimit(props.selectedRun.maxTokens)}`,
          `${props.selectedMatrixResult.attackerName} -> ${props.selectedMatrixResult.defenderName} | ${titleCaseStatus(props.selectedMatrixResult.status)}`,
          props.selectedMatrixResult.defenderOwnerName ? `Target owner: ${props.selectedMatrixResult.defenderOwnerName} [${props.selectedMatrixResult.defenderOwnerNameGroup ?? "-"}]` : "",
          ...props.attempts.flatMap((attempt, index) => [
            "",
            `Attempt ${attempt.attemptNumber} | ${titleCaseStatus(attempt.status)}`,
            "",
            ...buildBlockLines("Attack Prompt", attempt.attackPrompt, detailWrapWidth),
            "",
            ...buildBlockLines("Attack Message", attempt.attackMessage, detailWrapWidth),
            "",
            ...buildBlockLines("Defense Prompt", attempt.defensePrompt, detailWrapWidth),
            "",
            ...buildBlockLines(attempt.status === "error" ? "Error" : "Defense Response", attempt.defenseResponse || attempt.errorText || "", detailWrapWidth),
            ...(index === props.attempts.length - 1 ? [] : [""])
          ]).filter(Boolean)
        ]
      : !props.selectedHeadTurn
        ? ["Select a turn to inspect saved prompt and response."]
        : [
          props.selectedRun.runId,
          `${props.selectedRun.mode} | ${props.selectedRun.status} | conc ${props.selectedRun.concurrency} | tokens ${formatTokenLimit(props.selectedRun.maxTokens)}`,
          `Round ${props.selectedHeadTurn.roundNumber} | ${props.selectedHeadTurn.actorName} ${props.selectedHeadTurn.phase} -> ${props.selectedHeadTurn.targetName} | ${titleCaseStatus(props.selectedHeadTurn.status)}`,
          props.selectedHeadTurn.targetOwnerName ? `Target owner: ${props.selectedHeadTurn.targetOwnerName} [${props.selectedHeadTurn.targetOwnerNameGroup ?? "-"}]` : "",
          "",
          ...buildBlockLines("Prompt", props.selectedHeadTurn.promptText, detailWrapWidth),
          "",
          ...buildBlockLines(props.selectedHeadTurn.status === "error" ? "Error" : "Response", props.selectedHeadTurn.responseText || props.selectedHeadTurn.errorText || "", detailWrapWidth)
        ].filter(Boolean);
  const detailWindow = scrollWindow(detailLines, props.detailScrollOffset, detailVisibleLines);
  const detailMoreLines = Math.max(0, detailWindow.total - (detailWindow.offset + detailWindow.lines.length));
  const leaderboardNote = (
    <Box flexDirection="row">
      <Text color={props.leaderboardLabelMode === "model" ? "cyan" : "gray"}>[m]odel</Text>
      <Text color="gray"> </Text>
      <Text color={props.leaderboardLabelMode === "name" ? "cyan" : "gray"}>[n]ame</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" height={props.contentHeight} flexGrow={1}>
      <Box flexDirection="row" height={topHeight}>
        <Box width="50%" flexDirection="column">
          <Panel
            title="Runs"
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="1"
            hotkeyActive={props.focusPane === "runs"}
          >
            {visibleRuns.length === 0 ? (
              <Text color="gray">No saved runs found in this database.</Text>
            ) : (
              visibleRuns.map((run, index) => {
                const selected = runsOffset + index === selectedRunIndex;
                return (
                  <Text key={run.runId} color={selected ? "cyan" : undefined}>
                    {selected ? ">" : " "} {run.mode} {run.status} {run.startedAt.slice(0, 19).replace("T", " ")} L{run.leakCount} D{run.defendedCount} E{run.errorCount}
                  </Text>
                );
              })
            )}
          </Panel>
        </Box>

        <Box width="50%" marginLeft={1} flexDirection="column">
          <Panel
            title="Leaderboard"
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="2"
            hotkeyActive={props.focusPane === "leaderboard"}
            hotkeyNote={leaderboardNote}
          >
            <Text>{`${(props.leaderboardLabelMode === "model" ? "Model Ref" : "Name").padEnd(historyLeaderboardNameWidth)}  ${rightAlign("Attack", historyAttackWidth)}  ${rightAlign("Defense", historyDefenseWidth)}`}</Text>
            <Text color="gray">{`${"-".repeat(historyLeaderboardNameWidth)}  ${"-".repeat(historyAttackWidth)}  ${"-".repeat(historyDefenseWidth)}`}</Text>
            {displayLeaderboard.slice(0, Math.max(1, listVisibleLines - 2)).map((row) => (
              <Text key={`history-leader-${row.name}`}>
                {`${compactName(props.leaderboardLabelMode === "model" ? row.modelRef : row.name, historyLeaderboardNameWidth)}  ${rightAlign(formatCountPercent(row.attackLeaks, row.attackCells), historyAttackWidth)}  ${rightAlign(formatCountPercent(defenseHeldCount(row), row.defenseCells), historyDefenseWidth)}`}
              </Text>
            ))}
          </Panel>
        </Box>
      </Box>

      <Box flexDirection="row" height={bottomHeight}>
        <Box width="50%" flexDirection="column">
          <Panel
            title="Results"
            borderColor={uiColor("green", Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="3"
            hotkeyActive={props.focusPane === "results"}
          >
            {!props.selectedRun ? (
              <Text color="gray">Select a run to inspect saved results.</Text>
            ) : resultItems.length === 0 ? (
              props.selectedRun.mode === "matrix" ? (
                <Text color="gray">No matrix results saved for this run.</Text>
              ) : (
                <Text color="gray">No head-to-head turns saved for this run.</Text>
              )
            ) : (
              visibleResults.map((result, index) => {
                const selected = resultsOffset + index === selectedResultIndex;
                return (
                  <Text key={result.key} color={selected ? "cyan" : result.color}>
                    {selected ? ">" : " "} {result.text}
                  </Text>
                );
              })
            )}
          </Panel>
        </Box>

        <Box width="50%" marginLeft={1} flexDirection="column">
          <Panel
            title={`${detailTitle} ${detailWindow.total === 0 ? "0/0" : `${detailWindow.offset + 1}-${Math.min(detailWindow.offset + detailWindow.lines.length, detailWindow.total)}/${detailWindow.total}`}`}
            borderColor={uiColor(props.selectedRun?.mode === "matrix" ? detailPaneBorderColor(props.selectedMatrixResult?.status) : detailPaneBorderColor(props.selectedHeadTurn?.status), Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="4"
            hotkeyActive={props.focusPane === "details"}
          >
            <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
              <Box flexDirection="column">
                {detailWindow.lines.map((line, index) => {
                  const isBlockTitle = [
                    "Attack Prompt",
                    "Attack Message",
                    "Defense Prompt",
                    "Defense Response",
                    "Prompt",
                    "Response",
                    "Error"
                  ].includes(line);
                  const isAttemptLine = line.startsWith("Attempt ");
                  const isRunLine = props.selectedRun ? index === 0 && line === props.selectedRun.runId : false;
                  const activeStatus = props.selectedRun?.mode === "matrix" ? props.selectedMatrixResult?.status : props.selectedHeadTurn?.status;
                  return (
                    <Text
                      key={`history-detail-${index}`}
                      color={isBlockTitle ? "cyan" : isAttemptLine ? "gray" : isRunLine ? "cyan" : index === 2 ? statusColor(activeStatus) : undefined}
                    >
                      {line}
                    </Text>
                  );
                })}
              </Box>
              <Text color="gray">
                {detailMoreLines > 0
                  ? `${detailMoreLines} more lines. 4 focuses, j/k scroll.`
                  : "End of pane. 4 focuses, j/k scroll."}
              </Text>
            </Box>
          </Panel>
        </Box>
      </Box>
    </Box>
  );
}

function LeaksView(props: {
  leaks: LeakMatrixResultSummary[];
  attempts: MatrixHistoryAttemptDetail[];
  leakIndex: number;
  focusPane: LeakFocusPane;
  messageScrollOffset: number;
  contentHeight: number;
  contentWidth: number;
}): React.JSX.Element {
  const selectedLeak = props.leaks[clampIndex(props.leakIndex, props.leaks.length)];
  const halfPaneWidth = Math.max(40, Math.floor((props.contentWidth - 1) / 2));
  const paneWrapWidth = Math.max(32, halfPaneWidth - 6);
  const paneVisibleLines = Math.max(8, props.contentHeight - PANEL_FRAME_ROWS - DETAIL_FOOTER_ROWS);
  const detailHeight = Math.max(10, Math.floor(paneVisibleLines * 0.48));
  const listHeight = Math.max(4, paneVisibleLines - detailHeight - 1);
  const attemptsForLeak = props.attempts;
  const leakedAttempt = attemptsForLeak.find((attempt) => attempt.status === "leaked") ?? attemptsForLeak[attemptsForLeak.length - 1];

  const selectedDetailLines = !selectedLeak
    ? ["No leaked matchups found in this database."]
    : [
      selectedLeak.runId,
      `${selectedLeak.attackerName} -> ${selectedLeak.defenderName} | LEAK`,
      selectedLeak.defenderOwnerName ? `Target owner: ${selectedLeak.defenderOwnerName} [${selectedLeak.defenderOwnerNameGroup ?? "-"}]` : "",
      selectedLeak.finishedAt.replace("T", " ").slice(0, 19),
      leakedAttempt ? `Attempt ${leakedAttempt.attemptNumber} of ${selectedLeak.attempts}` : `Attempts ${selectedLeak.attempts}`,
      "",
      ...(leakedAttempt ? buildBlockLines("Attack Prompt", leakedAttempt.attackPrompt, paneWrapWidth) : ["Attack Prompt", "(empty)"]),
      "",
      ...(leakedAttempt ? buildBlockLines("Defense Prompt", leakedAttempt.defensePrompt, paneWrapWidth) : ["Defense Prompt", "(empty)"])
    ].filter(Boolean);
  const visibleDetailLines = clipLines(selectedDetailLines, detailHeight, false).slice(0, detailHeight);

  const listOffset = Math.max(
    0,
    Math.min(
      clampIndex(props.leakIndex, props.leaks.length) - Math.floor(listHeight / 2),
      Math.max(0, props.leaks.length - listHeight)
    )
  );
  const visibleLeakItems = props.leaks.slice(listOffset, listOffset + listHeight);

  const messageLines = !selectedLeak
    ? ["No leaked messages to inspect."]
    : attemptsForLeak.length === 0
      ? ["No attempt details saved for this leaked result."]
      : [
        `${selectedLeak.attackerName} -> ${selectedLeak.defenderName} | LEAK`,
        ...attemptsForLeak.flatMap((attempt, index) => [
          `Attempt ${attempt.attemptNumber} | ${titleCaseStatus(attempt.status)}`,
          "",
          ...buildBlockLines("Attack", attempt.attackMessage, paneWrapWidth),
          "",
          ...buildBlockLines(attempt.status === "error" ? "Error" : "Defense", attempt.defenseResponse || attempt.errorText || "", paneWrapWidth),
          ...(index === attemptsForLeak.length - 1 ? [] : [""])
        ])
      ];
  const messageWindow = scrollWindow(messageLines, props.messageScrollOffset, paneVisibleLines);
  const messageMoreLines = Math.max(0, messageWindow.total - (messageWindow.offset + messageWindow.lines.length));

  return (
    <Box flexDirection="row" height={props.contentHeight} flexGrow={1}>
      <Box width="50%" flexDirection="column">
        <Panel
          title={`Leaks ${props.leaks.length}`}
          borderColor="red"
          width="100%"
          height={props.contentHeight}
          hotkeyLabel="1"
          hotkeyActive={props.focusPane === "leaks"}
        >
          <Box flexDirection="column">
            {visibleDetailLines.map((line, index) => (
              <Text
                key={`leak-detail-${index}`}
                color={
                  line === "Attack Prompt" || line === "Defense Prompt"
                    ? "cyan"
                    : selectedLeak && index === 1
                      ? "red"
                      : selectedLeak && index === 0
                        ? "cyan"
                        : undefined
                }
              >
                {line}
              </Text>
            ))}
            <Text color="gray">{`${"-".repeat(Math.max(16, Math.min(halfPaneWidth - 6, 42)))}`}</Text>
            {visibleLeakItems.length === 0 ? (
              <Text color="gray">No leak rows.</Text>
            ) : (
              visibleLeakItems.map((leak, index) => {
                const selected = listOffset + index === clampIndex(props.leakIndex, props.leaks.length);
                return (
                  <Text key={`${leak.runId}-${leak.attackerName}-${leak.defenderName}-${index}`} color={selected ? "cyan" : "red"}>
                    {selected ? ">" : " "} {leak.attackerName} {"->"} {leak.defenderName} {leak.finishedAt.slice(0, 19).replace("T", " ")}
                  </Text>
                );
              })
            )}
          </Box>
        </Panel>
      </Box>

      <Box width="50%" marginLeft={1} flexDirection="column">
        <Panel
          title={`Messages ${messageWindow.total === 0 ? "0/0" : `${messageWindow.offset + 1}-${Math.min(messageWindow.offset + messageWindow.lines.length, messageWindow.total)}/${messageWindow.total}`}`}
          borderColor="red"
          width="100%"
          height={props.contentHeight}
          hotkeyLabel="2"
          hotkeyActive={props.focusPane === "messages"}
        >
          <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
            <Box flexDirection="column">
              {messageWindow.lines.map((line, index) => {
                const isBlockTitle = line === "Attack" || line === "Defense" || line === "Error";
                const isAttemptLine = line.startsWith("Attempt ");
                const isHeaderLine = index === 0 && selectedLeak ? line.startsWith(`${selectedLeak.attackerName} -> ${selectedLeak.defenderName}`) : false;
                return (
                  <Text key={`leak-message-${index}`} color={isBlockTitle ? "cyan" : isAttemptLine ? "gray" : isHeaderLine ? "red" : undefined}>
                    {line}
                  </Text>
                );
              })}
            </Box>
            <Text color="gray">
              {messageMoreLines > 0
                ? `${messageMoreLines} more lines. 2 focuses, j/k scroll.`
                : "End of pane. 2 focuses, j/k scroll."}
            </Text>
          </Box>
        </Panel>
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
  const currentLeaderboard = visibleLeaderboardRows(props.leaderboard).filter((row) => currentModelNames.has(row.name));
  const attackColumnValues = currentLeaderboard.map((row) => formatCountPercent(row.attackLeaks, row.attackCells));
  const defenseColumnValues = currentLeaderboard.map((row) => formatCountPercent(defenseHeldCount(row), row.defenseCells));
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
            title={props.title}
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="1"
            hotkeyActive={props.focusPane === "matrix"}
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
            title="Leaderboard"
            borderColor={uiColor("blue", Boolean(props.muted))}
            width="100%"
            height={topHeight}
            hotkeyLabel="2"
            hotkeyActive={props.focusPane === "leaderboard"}
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
            title={`Prompts ${promptWindow.total === 0 ? "0/0" : `${promptWindow.offset + 1}-${Math.min(promptWindow.offset + promptWindow.lines.length, promptWindow.total)}/${promptWindow.total}`}`}
            borderColor={uiColor(detailPaneBorderColor(activeResult?.status), Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="3"
            hotkeyActive={props.focusPane === "prompts"}
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
            title={`Messages ${messageWindow.total === 0 ? "0/0" : `${messageWindow.offset + 1}-${Math.min(messageWindow.offset + messageWindow.lines.length, messageWindow.total)}/${messageWindow.total}`}`}
            borderColor={uiColor(detailPaneBorderColor(activeResult?.status), Boolean(props.muted))}
            width="100%"
            height={bottomHeight}
            hotkeyLabel="4"
            hotkeyActive={props.focusPane === "messages"}
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
  concurrency: number;
  progress?: HeadToHeadProgressEvent;
  result?: HeadToHeadResult;
  turns: HeadToHeadTurn[];
  selectedIndex: number;
  focusPane: HeadFocusPane;
  promptScrollOffset: number;
  messageScrollOffset: number;
  muted?: boolean;
  contentHeight: number;
  contentWidth: number;
}): React.JSX.Element {
  const exchanges = deriveHeadToHeadExchanges(props.turns);
  const totalExchanges = 2;
  const selectedExchange = exchanges[clampIndex(props.selectedIndex, exchanges.length)];
  const errors = exchanges.filter((exchange) => exchange.status === "error").length;
  const leaks = exchanges.filter((exchange) => exchange.status === "leaked").length;
  const completedExchanges = exchanges.filter((exchange) => exchange.status !== "running").length;
  const paneGap = 1;
  const leftPaneWidth = Math.max(40, Math.floor((props.contentWidth - paneGap) / 2));
  const rightPaneWidth = Math.max(40, props.contentWidth - paneGap - leftPaneWidth);
  const leftDetailWrapWidth = Math.max(24, leftPaneWidth - 8);
  const rightDetailWrapWidth = Math.max(24, rightPaneWidth - 8);
  const halfPaneWidth = Math.min(leftPaneWidth, rightPaneWidth);
  const turnListContentLines = Math.max(exchanges.length, 1);
  const summaryContentLines = selectedExchange ? 7 : 5;
  const minTopHeight = panelHeightForContent(3);
  const minBottomHeight = panelHeightForContent(8);
  const desiredTopHeight = panelHeightForContent(Math.max(turnListContentLines, summaryContentLines));
  const maxTopHeight = Math.max(minTopHeight, props.contentHeight - minBottomHeight);
  const topHeight = Math.min(desiredTopHeight, maxTopHeight);
  const bottomHeight = Math.max(1, props.contentHeight - topHeight);
  const detailVisibleLines = Math.max(6, bottomHeight - PANEL_FRAME_ROWS - DETAIL_FOOTER_ROWS);
  const turnListVisibleLines = Math.max(4, topHeight - PANEL_FRAME_ROWS);
  const selectedTurnIndex = clampIndex(props.selectedIndex, exchanges.length);
  const turnsOffset = Math.max(0, Math.min(selectedTurnIndex - Math.floor(turnListVisibleLines / 2), Math.max(0, exchanges.length - turnListVisibleLines)));
  const visibleTurns = exchanges.slice(turnsOffset, turnsOffset + turnListVisibleLines);
  const titleWidth = Math.max(24, halfPaneWidth - 6);
  const headTitle = truncateLine(
    `AdversarialBench H2H ${completedExchanges}/${totalExchanges} c=${props.concurrency}`,
    titleWidth
  );
  const matchingAttackTurn = selectedExchange?.attackTurn;
  const matchingDefenseTurn = selectedExchange?.defenseTurn;
  const exchangeTitle = !selectedExchange
    ? undefined
    : `${selectedExchange.attacker} attack -> ${selectedExchange.defender} | ${titleCaseStatus(selectedExchange.status)}`;
  const promptLines = !selectedExchange
    ? ["No turn selected yet."]
    : [
      exchangeTitle ?? "",
      "",
      ...buildBlockLines("Attack Prompt", matchingAttackTurn?.prompt, leftDetailWrapWidth),
      "",
      ...buildBlockLines("Defense Prompt", matchingDefenseTurn?.prompt || (matchingAttackTurn?.status === "error" ? "(not reached)" : undefined), leftDetailWrapWidth)
    ].filter(Boolean);
  const messageLines = !selectedExchange
    ? ["No turn selected yet."]
    : [
      exchangeTitle ?? "",
      "",
      ...buildBlockLines(
        matchingAttackTurn?.status === "error" ? "Attack Error" : "Attack Message",
        matchingAttackTurn?.status === "error" ? matchingAttackTurn?.errorText : matchingAttackTurn?.text,
        rightDetailWrapWidth
      ),
      "",
      ...(matchingDefenseTurn?.leakedSecretOwner ? ["Leaked secret owner:", matchingDefenseTurn.leakedSecretOwner, ""] : []),
      ...buildBlockLines(
        matchingDefenseTurn?.status === "error" ? "Defense Error" : "Defense Response",
        matchingDefenseTurn?.text || matchingDefenseTurn?.errorText || (!matchingDefenseTurn ? (matchingAttackTurn?.status === "error" ? "(not reached)" : "Waiting for defense response...") : ""),
        rightDetailWrapWidth
      )
    ].filter(Boolean);
  const promptWindow = scrollWindow(promptLines, props.promptScrollOffset, detailVisibleLines);
  const messageWindow = scrollWindow(messageLines, props.messageScrollOffset, detailVisibleLines);
  const promptMoreLines = Math.max(0, promptWindow.total - (promptWindow.offset + promptWindow.lines.length));
  const messageMoreLines = Math.max(0, messageWindow.total - (messageWindow.offset + messageWindow.lines.length));

  return (
    <Box flexDirection="column" height={props.contentHeight} flexGrow={1}>
      <Box flexDirection="row" height={topHeight}>
        <Panel
          title={headTitle}
          borderColor={uiColor("blue", Boolean(props.muted))}
          width={leftPaneWidth}
          height={topHeight}
          hotkeyLabel="1"
          hotkeyActive={props.focusPane === "turns"}
        >
          {visibleTurns.length === 0 ? (
            <Text color="gray">Waiting for first turn...</Text>
          ) : (
            visibleTurns.map((turn, index) => {
              const selected = turnsOffset + index === selectedTurnIndex;
              return (
                <Text key={`${turn.round}-${turn.attacker}-${turn.defender}-${turnsOffset + index}`} color={selected ? "cyan" : statusColor(turn.status)}>
                  {selected ? ">" : " "} {turn.attacker} attack {"->"} {turn.defender} [{titleCaseStatus(turn.status)}]
                </Text>
              );
            })
          )}
        </Panel>
        <Box width={paneGap} />
        <Panel
          title="Summary"
          borderColor={uiColor("blue", Boolean(props.muted))}
          width={rightPaneWidth}
          height={topHeight}
          hotkeyLabel="2"
          hotkeyActive={props.focusPane === "summary"}
        >
          <Text>{truncateLine(`Match     ${props.left.name} vs ${props.right.name}`, rightDetailWrapWidth)}</Text>
          <Text>{`Progress  ${makeProgressBar(completedExchanges, totalExchanges)}`}</Text>
          <Text>{`Leaks     ${leaks}`}</Text>
          <Text>{`Errors    ${errors}`}</Text>
          <Text>{truncateLine(`Outcome   ${props.result?.outcome ?? props.progress?.outcome ?? "running"}`, rightDetailWrapWidth)}</Text>
          {selectedExchange ? (
            <>
              <Text color="gray"></Text>
              <Text color={statusColor(selectedExchange.status)}>
                {truncateLine(`Selected  ${selectedExchange.attacker} attack -> ${selectedExchange.defender}`, rightDetailWrapWidth)}
              </Text>
            </>
          ) : null}
        </Panel>
      </Box>

      <Box flexDirection="row" height={bottomHeight}>
        <Panel
          title={`Prompts ${promptWindow.total === 0 ? "0/0" : `${promptWindow.offset + 1}-${Math.min(promptWindow.offset + promptWindow.lines.length, promptWindow.total)}/${promptWindow.total}`}`}
          borderColor={uiColor(detailPaneBorderColor(selectedExchange?.status), Boolean(props.muted))}
          width={leftPaneWidth}
          height={bottomHeight}
          hotkeyLabel="3"
          hotkeyActive={props.focusPane === "prompts"}
        >
          <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
            <Box flexDirection="column">
              {promptWindow.lines.map((line, index) => (
                <Text
                  key={`head-prompt-${index}`}
                  color={
                    line === "Attack Prompt" || line === "Defense Prompt"
                      ? "cyan"
                      : selectedExchange && index === 0
                        ? statusColor(selectedExchange.status)
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
        <Box width={paneGap} />
        <Panel
          title={`Messages ${messageWindow.total === 0 ? "0/0" : `${messageWindow.offset + 1}-${Math.min(messageWindow.offset + messageWindow.lines.length, messageWindow.total)}/${messageWindow.total}`}`}
          borderColor={uiColor(detailPaneBorderColor(selectedExchange?.status), Boolean(props.muted))}
          width={rightPaneWidth}
          height={bottomHeight}
          hotkeyLabel="4"
          hotkeyActive={props.focusPane === "messages"}
        >
          <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
            <Box flexDirection="column">
              {messageWindow.lines.map((line, index) => (
                <Text
                  key={`head-message-${index}`}
                  color={
                    line === "Attack Message" || line === "Attack Error" || line === "Defense Response" || line === "Defense Error" || line === "Leaked secret owner:"
                      ? "cyan"
                      : selectedExchange && index === 0
                        ? statusColor(selectedExchange.status)
                        : undefined
                  }
                >
                  {line}
                </Text>
              ))}
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
  const cancelControllerRef = useRef(props.mode === "history" || props.mode === "leaks" ? undefined : new AbortController());
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
  const [headPromptScrollOffset, setHeadPromptScrollOffset] = useState(0);
  const [headMessageScrollOffset, setHeadMessageScrollOffset] = useState(0);
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
  const [historyDetailScrollOffset, setHistoryDetailScrollOffset] = useState(0);
  const [historyLeaderboardLabelMode, setHistoryLeaderboardLabelMode] = useState<LeaderboardLabelMode>("name");
  const [leakResults, setLeakResults] = useState<LeakMatrixResultSummary[]>([]);
  const [leakAttempts, setLeakAttempts] = useState<MatrixHistoryAttemptDetail[]>([]);
  const [leakIndex, setLeakIndex] = useState(0);
  const [leakFocusPane, setLeakFocusPane] = useState<LeakFocusPane>("leaks");
  const [leakMessageScrollOffset, setLeakMessageScrollOffset] = useState(0);
  const headExchangeCount = useMemo(() => deriveHeadToHeadExchanges(headTurns).length, [headTurns]);

  const closeDb = (): void => {
    if (!dbClosedRef.current) {
      const db = props.mode === "history" || props.mode === "leaks" ? props.db : props.context.db;
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
      if (props.mode === "history" || props.mode === "leaks") {
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
      if (input === "1") {
        setHistoryFocusPane("runs");
        return;
      }
      if (input === "2") {
        setHistoryFocusPane("leaderboard");
        return;
      }
      if (input === "3") {
        setHistoryFocusPane("results");
        return;
      }
      if (input === "4") {
        setHistoryFocusPane("details");
        return;
      }
      if (key.tab) {
        setHistoryFocusPane((current) =>
          current === "runs"
            ? "leaderboard"
            : current === "leaderboard"
              ? "results"
              : current === "results"
                ? "details"
                : "runs"
        );
        return;
      }
      if (historyFocusPane === "runs") {
        if (key.upArrow || input === "k") {
          setHistoryRunIndex((current) => Math.max(0, current - 1));
          setHistoryResultIndex(0);
          setHistoryDetailScrollOffset(0);
          return;
        }
        if (key.downArrow || input === "j") {
          setHistoryRunIndex((current) => Math.min(Math.max(0, historyRuns.length - 1), current + 1));
          setHistoryResultIndex(0);
          setHistoryDetailScrollOffset(0);
          return;
        }
        if (input === "l") {
          setHistoryFocusPane("leaderboard");
          return;
        }
      }
      if (historyFocusPane === "leaderboard") {
        if (input === "m") {
          setHistoryLeaderboardLabelMode("model");
          return;
        }
        if (input === "n") {
          setHistoryLeaderboardLabelMode("name");
          return;
        }
        if (input === "h") {
          setHistoryFocusPane("runs");
          return;
        }
        if (input === "l") {
          setHistoryFocusPane("results");
          return;
        }
      }
      if (historyFocusPane === "results") {
        const resultCount = historySelectedRun?.mode === "matrix" ? historyMatrixResults.length : historyHeadTurns.length;
        if (key.upArrow || input === "k") {
          setHistoryResultIndex((current) => Math.max(0, current - 1));
          setHistoryDetailScrollOffset(0);
          return;
        }
        if (key.downArrow || input === "j") {
          setHistoryResultIndex((current) => Math.min(Math.max(0, resultCount - 1), current + 1));
          setHistoryDetailScrollOffset(0);
          return;
        }
        if (input === "h") {
          setHistoryFocusPane("leaderboard");
          return;
        }
        if (input === "l") {
          setHistoryFocusPane("details");
          return;
        }
      }
      if (historyFocusPane === "details") {
        if (key.upArrow || input === "k") {
          setHistoryDetailScrollOffset((current) => Math.max(0, current - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setHistoryDetailScrollOffset((current) => current + 1);
          return;
        }
        if (input === "h") {
          setHistoryFocusPane("results");
          return;
        }
      }
      return;
    }

    if (props.mode === "leaks") {
      if (input === "1") {
        setLeakFocusPane("leaks");
        return;
      }
      if (input === "2") {
        setLeakFocusPane("messages");
        return;
      }
      if (key.tab || input === "h" || input === "l") {
        setLeakFocusPane((current) => current === "leaks" ? "messages" : "leaks");
        return;
      }
      if (leakFocusPane === "leaks") {
        if (key.upArrow || input === "k") {
          setLeakIndex((current) => Math.max(0, current - 1));
          setLeakMessageScrollOffset(0);
          return;
        }
        if (key.downArrow || input === "j") {
          setLeakIndex((current) => Math.min(Math.max(0, leakResults.length - 1), current + 1));
          setLeakMessageScrollOffset(0);
          return;
        }
        return;
      }
      if (key.upArrow || input === "k") {
        setLeakMessageScrollOffset((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setLeakMessageScrollOffset((current) => current + 1);
        return;
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

    if (input === "1") {
      setHeadFocusPane("turns");
      return;
    }
    if (input === "2") {
      setHeadFocusPane("summary");
      return;
    }
    if (input === "3") {
      setHeadFocusPane("prompts");
      return;
    }
    if (input === "4") {
      setHeadFocusPane("messages");
      return;
    }
    if (key.tab) {
      setHeadFocusPane((current) =>
        current === "turns"
          ? "summary"
          : current === "summary"
            ? "prompts"
            : current === "prompts"
              ? "messages"
              : "turns"
      );
      return;
    }

    if (headFocusPane === "turns") {
      if (key.upArrow || input === "k") {
        setHeadSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setHeadSelectedIndex((current) => Math.min(Math.max(0, headExchangeCount - 1), current + 1));
        return;
      }
      if (input === "l") {
        setHeadFocusPane("summary");
        return;
      }
      return;
    }

    if (headFocusPane === "summary") {
      if (input === "h") {
        setHeadFocusPane("turns");
        return;
      }
      if (input === "l") {
        setHeadFocusPane("prompts");
        return;
      }
      return;
    }

    if (input === "h") {
      setHeadFocusPane((current) => current === "messages" ? "prompts" : current === "prompts" ? "summary" : "turns");
      return;
    }
    if (input === "l") {
      setHeadFocusPane((current) => current === "turns" ? "summary" : current === "summary" ? "prompts" : "messages");
      return;
    }

    if (key.upArrow || input === "k") {
      if (headFocusPane === "prompts") {
        setHeadPromptScrollOffset((current) => Math.max(0, current - 1));
      } else {
        setHeadMessageScrollOffset((current) => Math.max(0, current - 1));
      }
      return;
    }
    if (key.downArrow || input === "j") {
      if (headFocusPane === "prompts") {
        setHeadPromptScrollOffset((current) => current + 1);
      } else {
        setHeadMessageScrollOffset((current) => current + 1);
      }
    }
  });

  useEffect(() => {
    setPromptScrollOffset(0);
    setMessageScrollOffset(0);
  }, [matrixSelectedColumn, matrixSelectedRow]);

  useEffect(() => {
    setHeadPromptScrollOffset(0);
    setHeadMessageScrollOffset(0);
  }, [headSelectedIndex]);

  useEffect(() => {
    setHeadSelectedIndex((current) => clampIndex(current, headExchangeCount));
  }, [headExchangeCount]);

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

        if (props.mode === "leaks") {
          const leaks = props.db.listLeakResults(200);
          if (cancelled) {
            return;
          }
          setLeakResults(leaks);
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

  useEffect(() => {
    if (props.mode !== "history") {
      return;
    }
    setHistoryDetailScrollOffset(0);
  }, [props.mode, historyRunIndex, historyResultIndex]);

  useEffect(() => {
    if (props.mode !== "leaks") {
      return;
    }
    const selectedLeak = leakResults[clampIndex(leakIndex, leakResults.length)];
    if (!selectedLeak) {
      setLeakAttempts([]);
      return;
    }
    setLeakAttempts(props.db.getMatrixAttemptsForPair(selectedLeak.runId, selectedLeak.attackerName, selectedLeak.defenderName));
  }, [props, leakResults, leakIndex]);

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
  const topBarHeight = props.mode === "matrix" || props.mode === "head-to-head" ? 0 : 1;
  const errorHeight = error ? panelHeightForContent(1) : 0;
  const bodyHeight = Math.max(16, viewportRows - topBarHeight - errorHeight);
  const modalOpen = confirmQuit && !completed;
  const topBarLine = useMemo(() => {
    if (props.mode === "history") {
      return truncateLine(`AdversarialBench History db=${props.dbPath}`, stdoutColumns);
    }

    if (props.mode === "leaks") {
      return truncateLine(`AdversarialBench Leaks ${leakResults.length} db=${props.dbPath}`, stdoutColumns);
    }

    if (props.mode === "matrix") {
      const completedCount = matrixProgress?.completed ?? 0;
      const totalCount = matrixProgress?.total ?? props.models.length * props.models.length;
      return truncateLine(
        `AdversarialBench Matrix ${completedCount}/${totalCount} msgs=${props.runtimeOptions.attackerMessages} conc=${props.runtimeOptions.concurrency}`,
        stdoutColumns
      );
    }

    const completedTurns = headExchangeCount;
    const totalTurns = 2;
    return truncateLine(
      `AdversarialBench Head-to-Head ${completedTurns}/${totalTurns} conc=${props.runtimeOptions.concurrency}`,
      stdoutColumns
    );
  }, [
    headExchangeCount,
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
            detailScrollOffset={historyDetailScrollOffset}
            leaderboardLabelMode={historyLeaderboardLabelMode}
            expandedText={expandedText}
            contentHeight={Math.max(bodyHeight, 16)}
            contentWidth={stdoutColumns}
            muted={false}
          />
        ) : props.mode === "leaks" ? (
          <LeaksView
            leaks={leakResults}
            attempts={leakAttempts}
            leakIndex={leakIndex}
            focusPane={leakFocusPane}
            messageScrollOffset={leakMessageScrollOffset}
            contentHeight={Math.max(bodyHeight, 16)}
            contentWidth={stdoutColumns}
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
            concurrency={props.runtimeOptions.concurrency}
            progress={headProgress}
            result={headResult}
            turns={headTurns}
            selectedIndex={headSelectedIndex}
            focusPane={headFocusPane}
            promptScrollOffset={headPromptScrollOffset}
            messageScrollOffset={headMessageScrollOffset}
            muted={false}
            contentHeight={Math.max(bodyHeight, 16)}
            contentWidth={stdoutColumns}
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
