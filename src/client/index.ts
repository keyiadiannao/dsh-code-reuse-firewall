/**
 * dsh-code-reuse-firewall browser half.
 *
 * No UI of its own: the plugin is purely a host-side tool (reuse_check) that
 * runs deterministic reuse retrieval before the agent writes new code. This
 * file exists so the client bundle builds; the host tool works without any
 * client contribution.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Required services (empty: nothing injected). */
export const inject = [] as const

export function apply(_ctx: ClientContext): void {
  // Intentional no-op: reuse retrieval happens entirely on the host side.
}
