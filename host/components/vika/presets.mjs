/**
 * vika 的两个 agent preset（worker / router）。
 *
 * 它们是 vika 组件的固定输入：vika 组件启用时由 host 在运行时注册到 agentPresets，
 * 不再作为独立插件行出现在 DSH 插件页。
 */

export const VIKA_AGENT_PRESETS = [
  {
    id: "vika-worker",
    name: "vika执行器",
    description: "vika 执行器 Session 专用，不供手动选择。前台命令超 5 秒转入后台，只含执行工作所需的工具。",
    order: 90,
    plugins: [
      {
        id: "persona",
        name: "@deepseek-ai/dsh-persona",
        config: {
          prefix: "You are a coding agent powered by the {{model}} model.",
        },
      },
      {
        id: "agent-instructions",
        name: "@deepseek-ai/dsh-agent-instructions",
        config: {
          maxBytes: 65536,
        },
      },
      {
        id: "time-context",
        name: "@deepseek-ai/dsh-time-context",
      },
      {
        id: "shell",
        name: "cordis:group",
        group: true,
        isolate: {
          shell: true,
        },
        config: [
          {
            id: "bash-sandbox",
            name: "@deepseek-ai/dsh-bash-sandbox",
            disabled: (process.platform === 'win32'),
            config: {
              timeoutMs: 5000,
              maxTimeoutMs: 5000,
            },
          },
          {
            id: "pwsh-sandbox",
            name: "@deepseek-ai/dsh-pwsh-sandbox",
            disabled: (process.platform !== 'win32'),
            config: {
              timeoutMs: 5000,
              maxTimeoutMs: 5000,
            },
          },
          {
            id: "tool-bash",
            name: "@deepseek-ai/dsh-tool-bash",
            disabled: (process.platform === 'win32'),
          },
          {
            id: "tool-pwsh",
            name: "@deepseek-ai/dsh-tool-pwsh",
            disabled: (process.platform !== 'win32'),
          }
        ],
      },
      {
        id: "tool-fs",
        name: "@deepseek-ai/dsh-tool-fs",
      },
      {
        id: "tool-fs-search",
        name: "@deepseek-ai/dsh-tool-fs-search",
        config: {
          sampleOverCapGlobResults: false,
        },
      },
      {
        id: "tool-jobs",
        name: "@deepseek-ai/dsh-tool-jobs",
        config: {
          waitTimeoutMs: 5000,
          maxWaitTimeoutMs: 5000,
        },
      },
      {
        id: "skill-filesystem",
        name: "@deepseek-ai/dsh-skill-filesystem",
      },
      {
        id: "tool-skill",
        name: "@deepseek-ai/dsh-tool-skill",
      },
      {
        id: "compaction",
        name: "cordis:group",
        group: true,
        isolate: {
          compaction: true,
          toolResultPruner: true,
        },
        config: [
          {
            id: "compaction-basic",
            name: "@deepseek-ai/dsh-compaction-basic",
          },
          {
            id: "command-compact",
            name: "@deepseek-ai/dsh-command-compact",
          },
          {
            id: "tool-result-pruner",
            name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
            config: {
              thresholdChars: 8192,
              headChars: 4096,
              tailChars: 1024,
            },
          }
        ],
      },
      {
        id: "delegation",
        name: "cordis:group",
        group: true,
        isolate: {
          workflowEngine: true,
        },
        config: [
          {
            id: "tool-subagent-control",
            name: "@deepseek-ai/dsh-tool-subagent-control",
          },
          {
            id: "tool-subagent",
            name: "@deepseek-ai/dsh-tool-subagent",
            config: {
              provider: "spawn",
              toolName: "subagent",
              modelSelection: true,
              modelDiscovery: true,
              agentPreset: "standard",
            },
          }
        ],
      },
      {
        id: "tool-todo",
        name: "@deepseek-ai/dsh-tool-todo",
        config: {
          allowParallelInProgress: true,
        },
      },
      {
        id: "tool-web",
        name: "@deepseek-ai/dsh-tool-web",
        config: {
          fetch: false,
          searchTimeoutMs: 60000,
        },
      }
    ],
  },
  {
    id: "vika-router",
    name: "vika主session",
    description: "vika 主 session 专用，不供手动选择。前台命令和任务等待超 5 秒转入后台，只含路由所需的工具。",
    order: 91,
    plugins: [
      {
        id: "agent-instructions",
        name: "@deepseek-ai/dsh-agent-instructions",
        config: {
          maxBytes: 65536,
        },
      },
      {
        id: "time-context",
        name: "@deepseek-ai/dsh-time-context",
      },
      {
        id: "shell",
        name: "cordis:group",
        group: true,
        isolate: {
          shell: true,
        },
        config: [
          {
            id: "bash-sandbox",
            name: "@deepseek-ai/dsh-bash-sandbox",
            disabled: (process.platform === 'win32'),
            config: {
              timeoutMs: 5000,
              maxTimeoutMs: 5000,
            },
          },
          {
            id: "pwsh-sandbox",
            name: "@deepseek-ai/dsh-pwsh-sandbox",
            disabled: (process.platform !== 'win32'),
            config: {
              timeoutMs: 5000,
              maxTimeoutMs: 5000,
            },
          },
          {
            id: "tool-bash",
            name: "@deepseek-ai/dsh-tool-bash",
            disabled: (process.platform === 'win32'),
          },
          {
            id: "tool-pwsh",
            name: "@deepseek-ai/dsh-tool-pwsh",
            disabled: (process.platform !== 'win32'),
          }
        ],
      },
      {
        id: "tool-fs",
        name: "@deepseek-ai/dsh-tool-fs",
        config: {
          write: false,
          edit: false,
        },
      },
      {
        id: "tool-jobs",
        name: "@deepseek-ai/dsh-tool-jobs",
        config: {
          waitTimeoutMs: 5000,
          maxWaitTimeoutMs: 5000,
        },
      },
      {
        id: "skill-filesystem",
        name: "@deepseek-ai/dsh-skill-filesystem",
      },
      {
        id: "tool-skill",
        name: "@deepseek-ai/dsh-tool-skill",
      },
      {
        id: "compaction",
        name: "cordis:group",
        group: true,
        isolate: {
          compaction: true,
          toolResultPruner: true,
        },
        config: [
          {
            id: "compaction-basic",
            name: "@deepseek-ai/dsh-compaction-basic",
          },
          {
            id: "command-compact",
            name: "@deepseek-ai/dsh-command-compact",
          },
          {
            id: "tool-result-pruner",
            name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
            config: {
              thresholdChars: 8192,
              headChars: 4096,
              tailChars: 1024,
            },
          }
        ],
      }
    ],
  }
]
