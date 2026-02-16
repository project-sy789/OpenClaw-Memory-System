#!/bin/sh
# Docker Entrypoint - Makes CLI commands easier

# If no arguments, show help
if [ $# -eq 0 ]; then
    echo "🧠 OpenClaw Memory System"
    echo "=========================="
    echo ""
    echo "Usage: docker run openclaw-memory [command]"
    echo ""
    echo "Commands:"
    echo "  stats                  Show memory statistics"
    echo "  remember <text> [tags...]  Store a fact"
    echo "  recall <query>         Search memories"
    echo "  health                 Check system health"
    echo "  interactive            Interactive mode"
    echo ""
    echo "Examples:"
    echo "  docker run openclaw-memory stats"
    echo "  docker run openclaw-memory remember \"Boss likes coffee\" preference food"
    echo "  docker run openclaw-memory recall \"what does boss like\""
    exit 0
fi

# Run the command
exec node dist/cli.js "$@"
