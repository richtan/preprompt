export function generateZshCompletions(): string {
  return `#compdef preprompt

_preprompt() {
  local -a commands
  commands=(
    'local:Run a prompt using locally installed AI agents'
    'list:Show detected AI agents and their status'
    'diff:Compare filesystem results across agents'
    'trace:Replay an agent execution trace'
    'doctor:Diagnose why an agent failed'
    'fix:Suggest prompt rewrites to fix failures'
    'compare:Compare two runs before/after'
    'badge:Generate an SVG compatibility badge'
    'cloud:Run a prompt on PrePrompt Cloud'
    'login:Authenticate with PrePrompt Cloud'
    'explain:Show agent behavior profiles'
    'history:List past runs'
    'completions:Generate shell completions'
  )

  local -a agents
  agents=('claude-code' 'codex' 'copilot-cli' 'cursor' 'gemini' 'opencode')

  local -a presets
  presets=('empty' 'node' 'nextjs' 'python' 'monorepo' 'docker')

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-V --version)'{-V,--version}'[Show version]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case "$state" in
    command)
      _describe 'preprompt command' commands
      ;;
    args)
      case "$words[1]" in
        local)
          _arguments \\
            '(-t --timeout)'{-t,--timeout}'[Timeout in ms]:timeout' \\
            '--json[Output JSON]' \\
            '--quiet[Suppress output]' \\
            '--agents[Agents to use]:agents:_values -s , agent $agents' \\
            '*--check[Assertion]:check' \\
            '1:prompt:_files'
          ;;
        diff)
          _arguments '1:run ID'
          ;;
        trace)
          _arguments \\
            '--compare[Compare all agents]' \\
            '--run[Run ID]:run ID' \\
            '1:agent:_values agent $agents'
          ;;
        doctor)
          _arguments \\
            '--run[Run ID]:run ID' \\
            '--agent[Agent name]:agent:_values agent $agents' \\
            '(-t --timeout)'{-t,--timeout}'[Timeout]:timeout'
          ;;
        fix)
          _arguments \\
            '--run[Run ID]:run ID' \\
            '--apply[Apply fix to prompt file]' \\
            '(-t --timeout)'{-t,--timeout}'[Timeout]:timeout'
          ;;
        compare)
          _arguments '1:run A' '2:run B'
          ;;
        badge)
          _arguments \\
            '--run[Run ID]:run ID' \\
            '(-o --output)'{-o,--output}'[Output path]:output:_files'
          ;;
        explain)
          _arguments '1:agent:_values agent $agents'
          ;;
        *)
          _arguments \\
            '(-t --timeout)'{-t,--timeout}'[Timeout in ms]:timeout' \\
            '--json[Output JSON]' \\
            '--quiet[Suppress output]' \\
            '--agents[Agents to use]:agents:_values -s , agent $agents' \\
            '*--check[Assertion]:check' \\
            '1:prompt:_files'
          ;;
      esac
      ;;
  esac
}

_preprompt
`
}
