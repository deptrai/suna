/**
 * Epsilon System XML — utilities for handling <epsilon_system> tags.
 *
 * Backend plugins wrap internal content (session context, memory, orchestrator
 * state, PTY output, etc.) in <epsilon_system type="..." source="..."> tags.
 *
 * - stripEpsilonSystemTags: removes ALL tags before markdown rendering
 * - extractSessionReport: parses session-report tags into structured data
 */

const EPSILON_SYSTEM_RE = /<epsilon_system[^>]*>[\s\S]*?<\/epsilon_system>/gi

export function stripEpsilonSystemTags(text: string): string {
	if (!text) return ""
	return text.replace(EPSILON_SYSTEM_RE, "").trim()
}

// ── Session Report extraction ────────────────────────────────────────────────

export interface SessionReport {
	sessionId: string
	status: "COMPLETE" | "FAILED"
	project: string
	prompt: string
	result: string
}

const SESSION_REPORT_RE = /<epsilon_system[^>]*type="session-report"[^>]*>[\s\S]*?<session-report>([\s\S]*?)<\/session-report>[\s\S]*?<\/epsilon_system>/i

export function extractSessionReport(text: string): SessionReport | null {
	if (!text) return null
	const match = text.match(SESSION_REPORT_RE)
	if (!match) return null

	const xml = match[1]
	const get = (tag: string) => {
		const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
		return m?.[1]?.trim() || ""
	}

	return {
		sessionId: get("session-id"),
		status: get("status") === "FAILED" ? "FAILED" : "COMPLETE",
		project: get("project"),
		prompt: get("prompt"),
		result: get("result"),
	}
}

/**
 * Check if a user message text is purely a epsilon_system message
 * (no visible user content outside the tags).
 */
export function isEpsilonSystemOnly(text: string): boolean {
	if (!text) return false
	return stripEpsilonSystemTags(text).length === 0
}

// ── System message parsing for inline rendering ─────────────────────────────

export interface EpsilonSystemMessage {
	type: string
	source: string
	label: string
	detail?: string
}

const EPSILON_SYSTEM_EXTRACT_RE = /<epsilon_system[^>]*?\btype="([^"]*)"[^>]*?\bsource="([^"]*)"[^>]*>([\s\S]*?)<\/epsilon_system>/gi

/**
 * Extract structured info from epsilon_system tags for inline UI rendering.
 * Returns an array of parsed system messages found in the text.
 */
export function extractEpsilonSystemMessages(text: string): EpsilonSystemMessage[] {
	if (!text) return []
	const results: EpsilonSystemMessage[] = []
	let match: RegExpExecArray | null
	const re = new RegExp(EPSILON_SYSTEM_EXTRACT_RE.source, "gi")
	while ((match = re.exec(text)) !== null) {
		const type = match[1]
		const source = match[2]
		const body = match[3].trim()

		// Skip types that are already rendered elsewhere or are purely hidden context.
		if (
			type === "session-report" ||
			type.startsWith("pty-") ||
			type === "project-status" ||
			type === "project-context" ||
			type === "session-context" ||
			type === "memory-context"
		) continue

		const { label, detail } = describeSystemMessage(type, source, body)
		results.push({ type, source, label, detail })
	}
	return results
}

function describeSystemMessage(type: string, source: string, body: string): { label: string; detail?: string } {
	// Autowork / Ralph continuation
	if (type === "autowork-continue" || type === "ralph-continue") {
		const iterMatch = body.match(/\[(?:AUTOWORK|RALPH)\s*-\s*ITERATION\s+(\d+)\/(\d+)\]/i)
		if (iterMatch) {
			return { label: `Autowork`, detail: `iteration ${iterMatch[1]}/${iterMatch[2]}` }
		}
		if (body.includes("COMPLETION REJECTED")) {
			return { label: "Autowork", detail: "completion rejected — continuing" }
		}
		return { label: "Autowork", detail: "continuing" }
	}

	// Passive continuation (todo enforcer)
	if (type === "passive-continuation") {
		return { label: "Continue", detail: "todo enforcer" }
	}

	// Task-related
	if (type === "tasks") {
		return { label: "Tasks", detail: "sync" }
	}

	// Project status injection
	if (type === "project-status") {
		return { label: "Project", detail: "status" }
	}

	// Rules / instructions
	if (type === "rules" || type === "instruction") {
		return { label: "System", detail: source.replace(/^epsilon-/, "") }
	}

	// Fallback
	const shortSource = source.replace(/^epsilon-/, "")
	return { label: type.replace(/-/g, " "), detail: shortSource !== type ? shortSource : undefined }
}
