// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The Tab completion scripts of `mp completion bash|zsh|fish` ([R-CLI-001](../../docs/requirements.md#r-cli-001)), as
 * nimblescape TypeScript writes them for `ts`. They complete the commands in the first place, the options of a command,
 * the words of `new`, `instructions` and `completion`, and the Markdown files and the folders of the folder.
 *
 * - bash: `source <(mp completion bash)` in ~/.bashrc, or the file in a folder `bash-completion/completions/mp` of
 *   XDG_DATA_DIRS, which bash-completion loads when mp is first completed (the extension uses this).
 * - zsh: `source <(mp completion zsh)` in ~/.zshrc after compinit, or the file `_mp` in a folder of fpath (the
 *   extension adds its folder to FPATH). The same text works both ways.
 * - fish: `mp completion fish | source` in ~/.config/fish/config.fish, or the file ~/.config/fish/completions/mp.fish.
 *
 * The module uses no API of VS Code.
 */

/** Shell is a shell with a completion script. */
export type Shell = 'bash' | 'zsh' | 'fish';

/** shells are the shells of `mp completion`. */
export const shells: readonly Shell[] = ['bash', 'zsh', 'fish'];

/** Verb is a command of mp: its name, its description, its options, and the words or the kind of its first argument. */
export interface Verb {
  name: string;
  description: string;
  options?: readonly string[];
  /** values are the words of the first argument, such as the topics of `instructions`. */
  values?: readonly string[];
  /** files is the kind of the arguments: Markdown files, or folders. */
  files?: 'markdown' | 'folder';
}

/** verbs are the commands of mp with their options, as the help of cli.ts names them. */
export const verbs: readonly Verb[] = [
  { name: 'build', description: 'write the PDF of a file', options: ['--output', '--html', '--browser', '--download-browser'], files: 'markdown' },
  { name: 'check', description: 'check the front matter and the links', files: 'markdown' },
  { name: 'format', description: 'write the citations, the reference list and the lists', options: ['--check'], files: 'markdown' },
  { name: 'create', description: 'scaffold a new project', options: ['--layout', '--language', '--title', '--author', '--yes'], files: 'folder' },
  { name: 'new', description: 'write a new document, layout or project', options: ['--layout', '--title', '--author', '--from', '--language'], values: ['document', 'layout', 'project'] },
  { name: 'layouts', description: 'list the layouts that create offers' },
  { name: 'preview', description: 'write the preview PDF of a layout', options: ['--write', '--browser', '--download-browser'], files: 'folder' },
  { name: 'get', description: 'clone the repositories that the papers name', options: ['-u', '--force', '--name', '--yes'], files: 'markdown' },
  { name: 'instructions', description: 'print the rules for AI agents', values: ['document', 'layout', 'render'] },
  { name: 'source', description: 'add sources to the database of a file', options: ['--id', '--title', '--offline', '--dry-run', '--search'], files: 'markdown' },
  { name: 'completion', description: 'print the Tab completion script of a shell', values: shells },
];

/** globalOptions are the options in the first place. */
export const globalOptions: readonly string[] = ['--help', '--version'];

/**
 * bash returns the completion script of bash.
 * @param name - The name of the command.
 */
function bash(name: string): string {
  const markdown = `$(compgen -d -- "$cur") $(compgen -f -X '!*.md' -- "$cur")`;
  const cases = verbs.map((verb) => {
    const words = [...(verb.values ?? []), ...(verb.options ?? [])].join(' ');
    const files = verb.files === 'markdown' ? ` ${markdown}` : verb.files === 'folder' ? ' $(compgen -d -- "$cur")' : '';
    return `    ${verb.name}) compopt -o filenames; COMPREPLY=($(compgen -W "${words}" -- "$cur")${files}) ;;`;
  });
  return `# Tab completion of the command ${name} for bash: ${name} completion bash
_mp_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if ((COMP_CWORD == 1)); then
    COMPREPLY=($(compgen -W "${[...verbs.map((verb) => verb.name), ...globalOptions].join(' ')}" -- "$cur"))
    return
  fi
  case "\${COMP_WORDS[1]}" in
${cases.join('\n')}
    *) compopt -o default; COMPREPLY=() ;;
  esac
}
complete -F _mp_completion ${name}
`;
}

/**
 * zsh returns the completion script of zsh.
 * @param name - The name of the command.
 */
function zsh(name: string): string {
  const quote = (text: string): string => text.replace(/'/g, `'\\''`);
  const cases = verbs.map((verb) => {
    const words = [...(verb.values ?? []), ...(verb.options ?? [])].map((word) => `'${word}'`).join(' ');
    const files = verb.files === 'markdown' ? `_files -g '*.md(-.)'` : verb.files === 'folder' ? '_files -/' : '';
    return `    ${verb.name}) ${[...(words ? [`compadd -- ${words}`] : []), files || ':'].join('; ')} ;;`;
  });
  return `#compdef ${name}
# Tab completion of the command ${name} for zsh: ${name} completion zsh
_mp() {
  local -a commands
  commands=(
${verbs.map((verb) => `    '${verb.name}:${quote(verb.description)}'`).join('\n')}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands 'command' commands
    compadd -- ${globalOptions.join(' ')}
    return
  fi
  case $words[2] in
${cases.join('\n')}
    *) _files ;;
  esac
}
if [[ "\${funcstack[1]}" == _mp ]]; then
  _mp "$@"
else
  compdef _mp ${name}
fi
`;
}

/**
 * fish returns the completion script of fish.
 * @param name - The name of the command.
 */
function fish(name: string): string {
  const first = '__fish_use_subcommand';
  const lines = [
    `complete -c ${name} -f`,
    ...verbs.map((verb) => `complete -c ${name} -n ${first} -a ${verb.name} -d '${verb.description}'`),
    ...globalOptions.map((option) => `complete -c ${name} -n ${first} -l ${option.slice(2)}`),
    ...verbs.flatMap((verb) => {
      const seen = `'__fish_seen_subcommand_from ${verb.name}'`;
      return [
        ...(verb.options ?? []).map((option) => `complete -c ${name} -n ${seen} ${option.startsWith('--') ? `-l ${option.slice(2)}` : `-s ${option.slice(1)}`}`),
        ...(verb.values ? [`complete -c ${name} -n ${seen} -a '${verb.values.join(' ')}'`] : []),
        ...(verb.files === 'markdown' ? [`complete -c ${name} -n ${seen} -a '(__fish_complete_suffix .md)'`] : []),
        ...(verb.files === 'folder' ? [`complete -c ${name} -n ${seen} -a '(__fish_complete_directories)'`] : []),
      ];
    }),
  ];
  return `# Tab completion of the command ${name} for fish: ${name} completion fish
${lines.join('\n')}
`;
}

/**
 * completionScript returns the Tab completion script of a shell.
 * @param shell - The shell.
 * @param name - The name of the command.
 */
export function completionScript(shell: Shell, name = 'mp'): string {
  return { bash, zsh, fish }[shell](name);
}
