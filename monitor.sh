#!/bin/bash
# monitor.sh — NanoClaw Agent Monitor Dashboard v3
# Uruchom w osobnej zakładce terminala VSCode:
#   cd ~/nano-claw && bash monitor.sh
#
# Odświeża co 3 sekundy bez migotania. Ctrl+C aby zatrzymać.

NANOCLAW_DIR="${HOME}/nano-claw"
GROUPS_DIR="${NANOCLAW_DIR}/groups"
INBOX_DIR="${GROUPS_DIR}/shared/inbox"
DB_PATH="${NANOCLAW_DIR}/store/messages.db"
REFRESH=3

# Agenci i ich foldery
declare -A AGENTS=(
  ["Bill"]="telegram_SolutionDesigner"
  ["Roy"]="telegram_TestManager"
  ["Tony"]="telegram_TestLead"
  ["Rick"]="telegram_ManualTester"
  ["Jim"]="telegram_AutomationEngineer"
)

declare -A ROLES=(
  ["Bill"]="Solution Designer"
  ["Roy"]="Test Manager"
  ["Tony"]="Test Lead"
  ["Rick"]="Manual Tester"
  ["Jim"]="Automation Engineer"
)

# Kolory
R="\033[0m"     # reset
B="\033[1m"     # bold
D="\033[2m"     # dim
GR="\033[32m"   # green
YE="\033[33m"   # yellow
BL="\033[34m"   # blue
CY="\033[36m"   # cyan
RD="\033[31m"   # red
CL="\033[K"     # clear to end of line

# ==================== DATA FUNCTIONS ====================

is_nanoclaw_running() {
  if systemctl --user is-active nanoclaw &>/dev/null; then
    echo "systemd"
    return
  fi
  if pgrep -f "nanoclaw.*index.js" &>/dev/null || pgrep -f "node dist/index.js" &>/dev/null; then
    echo "process"
    return
  fi
  echo "stopped"
}

get_agent_status() {
  local folder="${AGENTS[$1]}"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$folder"; then
    echo "WORKING"
  else
    echo "IDLE"
  fi
}

get_last_log_info() {
  local folder="${AGENTS[$1]}"
  local logs_dir="${GROUPS_DIR}/${folder}/logs"

  [[ ! -d "$logs_dir" ]] && echo "null|null|null" && return

  local latest_log
  latest_log=$(ls -t "$logs_dir"/*.log 2>/dev/null | head -1)
  [[ -z "$latest_log" ]] && echo "null|null|null" && return

  local timestamp duration exit_code
  timestamp=$(grep "^Timestamp:" "$latest_log" 2>/dev/null | head -1 | sed 's/Timestamp: //')
  duration=$(grep "^Duration:" "$latest_log" 2>/dev/null | head -1 | sed 's/Duration: //' | sed 's/ms//')
  exit_code=$(grep "^Exit Code:" "$latest_log" 2>/dev/null | head -1 | sed 's/Exit Code: //')

  if [[ -n "$duration" && "$duration" != "null" ]]; then
    local secs=$((duration / 1000))
    if [[ $secs -ge 60 ]]; then
      duration="$((secs / 60))m $((secs % 60))s"
    else
      duration="${secs}s"
    fi
  fi

  if [[ -n "$timestamp" && "$timestamp" != "null" ]]; then
    timestamp=$(echo "$timestamp" | sed 's/T/ /' | sed 's/\..*//')
  fi

  echo "${timestamp:-null}|${duration:-null}|${exit_code:-null}"
}

get_last_action() {
  local name="$1"
  local max_len="${2:-70}"

  [[ ! -f "$DB_PATH" ]] && echo "null" && return

  # Pobierz ostatnią wiadomość agenta z bazy (is_from_me = 1, sender_name = imię agenta)
  local msg
  msg=$(sqlite3 "$DB_PATH" "SELECT content FROM messages WHERE is_from_me = 1 AND sender_name = '${name}' ORDER BY timestamp DESC LIMIT 1;" 2>/dev/null)

  if [[ -z "$msg" ]]; then
    echo "null"
    return
  fi

  # Usuń tagi <internal>
  msg=$(echo "$msg" | sed 's/<internal>.*<\/internal>//g' | tr '\n' ' ' | sed 's/  */ /g' | xargs)

  # Obetnij do max_len
  if [[ ${#msg} -gt $max_len ]]; then
    msg="${msg:0:$max_len}..."
  fi

  echo "$msg"
}

get_last_workspace_file() {
  local folder="${AGENTS[$1]}"
  local ws_dir="${GROUPS_DIR}/${folder}"
  find "$ws_dir" -maxdepth 2 -type f \
    ! -path "*/logs/*" ! -path "*/conversations/*" ! -path "*/.claude/*" \
    ! -name "CLAUDE.md" ! -name "*.log" \
    -printf '%T@ %f\n' 2>/dev/null | sort -rn | head -1 | awk '{print $2}'
}

get_inbox_info() {
  local folder="${AGENTS[$1]}"
  local inbox_file=""
  case "$folder" in
    telegram_TestManager)         inbox_file="to_TestManager.json" ;;
    telegram_TestLead)            inbox_file="to_TestLead.json" ;;
    telegram_ManualTester)        inbox_file="to_ManualTester.json" ;;
    telegram_AutomationEngineer)  inbox_file="to_AutomationEngineer.json" ;;
    telegram_SolutionDesigner)    inbox_file="to_SolutionDesigner.json" ;;
  esac

  local fpath="${INBOX_DIR}/${inbox_file}"
  if [[ -n "$inbox_file" && -f "$fpath" ]]; then
    local count
    count=$(grep -c '"from"' "$fpath" 2>/dev/null || echo "0")
    echo "${count} msg"
  else
    echo "-"
  fi
}

# ==================== RENDER ====================

LINE=0

print_line() {
  LINE=$((LINE + 1))
  tput cup "$LINE" 0
  printf "%b${CL}\n" "$1"
}

render() {
  LINE=-1
  local now
  now=$(date '+%Y-%m-%d %H:%M:%S')

  # Nagłówek
  print_line "${B}${BL}══════════════════════════════════════════════════════════════════════════════════${R}"
  print_line "${B}   NanoClaw QA Agent Monitor${R}                                    ${D}${now}${R}"
  print_line "${B}${BL}══════════════════════════════════════════════════════════════════════════════════${R}"
  print_line ""

  # NanoClaw status
  local nc_status
  nc_status=$(is_nanoclaw_running)
  case "$nc_status" in
    systemd) print_line "  NanoClaw service:  ${GR}${B}● RUNNING${R} ${D}(systemd)${R}" ;;
    process) print_line "  NanoClaw service:  ${GR}${B}● RUNNING${R} ${D}(process)${R}" ;;
    stopped) print_line "  NanoClaw service:  ${RD}● STOPPED${R}" ;;
  esac

  # Aktywne kontenery
  local active
  active=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c -E "nanoclaw|telegram_" || echo "0")
  print_line "  Active containers: ${B}${active}${R}"
  print_line ""

  # Tabela agentów — nagłówek
  print_line "  ${B}┌────────┬────────────────────────┬──────────┬──────────────────────────────┐${R}"
  print_line "  ${B}│ Agent  │ Role                   │ Status   │ Last run                     │${R}"
  print_line "  ${B}├────────┼────────────────────────┼──────────┼──────────────────────────────┤${R}"

  for name in Bill Roy Tony Rick Jim; do
    local role="${ROLES[$name]}"
    local status
    status=$(get_agent_status "$name")

    # Status display
    local status_str
    if [[ "$nc_status" == "stopped" ]]; then
      status_str="${D}  -   ${R}"
    elif [[ "$status" == "WORKING" ]]; then
      status_str="${GR}${B}WORKING${R} "
    else
      status_str="${D}IDLE    ${R}"
    fi

    # Last run
    local log_info
    IFS='|' read -r log_time log_duration log_exit <<< "$(get_last_log_info "$name")"

    local last_run_str
    if [[ "$log_time" == "null" ]]; then
      last_run_str="${D}no runs yet${R}                   "
    else
      local exit_indicator
      if [[ "$log_exit" == "0" ]]; then
        exit_indicator="${GR}OK${R}"
      else
        exit_indicator="${RD}ERR${R}"
      fi
      local short_time
      short_time=$(echo "$log_time" | awk '{print $2}' | cut -d: -f1-2)
      local short_date
      short_date=$(echo "$log_time" | awk '{print $1}')
      last_run_str="${D}${short_date} ${short_time}${R} ${exit_indicator} ${D}(${log_duration})${R}"
    fi

    printf "  │ ${CY}%-6s${R} │ %-22s │ " "$name" "$role"
    printf "%b" "$status_str"
    printf "│ %b" "$last_run_str"
    tput el
    echo " │"
    LINE=$((LINE + 1))
  done

  print_line "  ${B}└────────┴────────────────────────┴──────────┴──────────────────────────────┘${R}"
  print_line ""

  # Last action per agent
  print_line "  ${B}Last action:${R}"
  for name in Bill Roy Tony Rick Jim; do
    local action
    action=$(get_last_action "$name" 72)
    if [[ "$action" == "null" ]]; then
      print_line "    ${CY}${name}${R}: ${D}-${R}"
    else
      print_line "    ${CY}${name}${R}: ${action}"
    fi
  done
  print_line ""

  # Workspace files
  print_line "  ${B}Latest workspace files:${R}"
  for name in Bill Roy Tony Rick Jim; do
    local wfile
    wfile=$(get_last_workspace_file "$name")
    if [[ -n "$wfile" ]]; then
      print_line "    ${CY}${name}${R}: ${wfile}"
    else
      print_line "    ${CY}${name}${R}: ${D}-${R}"
    fi
  done
  print_line ""

  # Inbox
  print_line "  ${B}Inbox:${R}"
  for name in Bill Roy Tony Rick Jim; do
    local inbox
    inbox=$(get_inbox_info "$name")
    print_line "    ${CY}${name}${R}: ${D}${inbox}${R}"
  done
  print_line ""
  print_line "  ${D}Refreshing every ${REFRESH}s. Ctrl+C to stop.${R}"

  # Wyczyść resztę ekranu
  tput ed
}

# ==================== MAIN ====================

trap 'tput cnorm; echo -e "\n${R}Monitor stopped."; exit 0' INT

tput civis
clear

while true; do
  render
  sleep "$REFRESH"
done
