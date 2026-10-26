(() => {
  'use strict'

  const getById = (id) => document.getElementById(id)

  function initializeNavigation() {
    const toggle = document.querySelector('.nav-toggle')
    const navigation = getById('primary-nav')
    if (!toggle || !navigation) return

    const closeMenu = () => {
      navigation.classList.remove('is-open')
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-label', 'Open navigation')
    }

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true'
      toggle.setAttribute('aria-expanded', String(!isOpen))
      toggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation')
      navigation.classList.toggle('is-open', !isOpen)
    })

    navigation.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) closeMenu()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu()
    })

    document.addEventListener('click', (event) => {
      if (event.target instanceof Node && !navigation.contains(event.target) && !toggle.contains(event.target)) closeMenu()
    })
  }

  function initializeCommandSearch() {
    const list = getById('command-list')
    const search = getById('command-search')
    const category = getById('command-category')
    const summary = getById('command-results')
    const empty = getById('command-empty')
    if (!list || !search || !category || !summary || !empty) return

    const cards = Array.from(list.querySelectorAll('[data-command-card]'))
    const filterCards = () => {
      const query = search.value.trim().toLocaleLowerCase()
      const selectedCategory = category.value
      let visible = 0

      for (const card of cards) {
        const matchesText = !query || card.textContent.toLocaleLowerCase().includes(query)
        const matchesCategory = selectedCategory === 'all' || card.dataset.category === selectedCategory
        const show = matchesText && matchesCategory
        card.hidden = !show
        if (show) visible += 1
      }

      summary.textContent = `Showing ${visible} of ${cards.length} commands.`
      empty.hidden = visible !== 0
    }

    search.addEventListener('input', filterCards)
    category.addEventListener('change', filterCards)
    filterCards()
  }

  function initializeTerminal() {
    const form = getById('terminal-form')
    const input = getById('terminal-input')
    const output = getById('terminal-output')
    const resetButton = getById('terminal-reset')
    const prompt = document.querySelector('.terminal-prompt')
    if (!form || !input || !output || !resetButton || !prompt) return

    const homeDirectory = '/home/learner'
    let workingDirectory = homeDirectory
    let commandHistory = []
    let historyPosition = 0
    let fileSystem

    const createFileSystem = () => new Map([
      ['/', { type: 'directory', content: '' }],
      ['/home', { type: 'directory', content: '' }],
      [homeDirectory, { type: 'directory', content: '' }],
      [`${homeDirectory}/Documents`, { type: 'directory', content: '' }],
      [`${homeDirectory}/projects`, { type: 'directory', content: '' }],
      ['/etc', { type: 'directory', content: '' }],
      ['/etc/os-release', { type: 'file', content: 'NAME="Practice Linux"\nID=practice\nVERSION="1.0"\n' }],
      ['/var', { type: 'directory', content: '' }],
      ['/var/log', { type: 'directory', content: '' }],
      ['/var/log/example.log', { type: 'file', content: 'INFO practice service ready\nINFO sample filesystem mounted\n' }],
      [`${homeDirectory}/welcome.txt`, { type: 'file', content: 'Welcome to the Linux Learning Hub practice folder.\nTry pwd, ls, and cat.\n' }],
      [`${homeDirectory}/todo.txt`, { type: 'file', content: '1. Explore the filesystem\n2. Practice a safe command\n3. Review one networking idea\n' }],
      [`${homeDirectory}/Documents/notes.txt`, { type: 'file', content: 'Linux is a kernel. A distribution adds tools and a release.\n' }],
      [`${homeDirectory}/projects/readme.txt`, { type: 'file', content: 'Sample project directory for command practice.\n' }],
    ])

    const updatePrompt = () => {
      const displayPath = workingDirectory === homeDirectory
        ? '~'
        : workingDirectory.startsWith(`${homeDirectory}/`)
          ? `~${workingDirectory.slice(homeDirectory.length)}`
          : workingDirectory
      prompt.textContent = `learner@practice:${displayPath}$`
    }

    const appendEntry = (text, kind = '') => {
      if (!text) return
      const entry = document.createElement('div')
      entry.className = `terminal-entry${kind ? ` ${kind}` : ''}`
      entry.textContent = text
      output.append(entry)
      output.scrollTop = output.scrollHeight
    }

    const appendCommand = (commandText) => {
      const entry = document.createElement('div')
      entry.className = 'terminal-entry'
      const promptText = document.createElement('span')
      promptText.className = 'terminal-command'
      promptText.textContent = `${prompt.textContent} ${commandText}`
      entry.append(promptText)
      output.append(entry)
      output.scrollTop = output.scrollHeight
    }

    const normalizePath = (path, base = workingDirectory) => {
      let expanded = path || base
      if (expanded === '~') expanded = homeDirectory
      else if (expanded.startsWith('~/')) expanded = `${homeDirectory}/${expanded.slice(2)}`
      const combined = expanded.startsWith('/') ? expanded : `${base}/${expanded}`
      const parts = []

      for (const part of combined.split('/')) {
        if (!part || part === '.') continue
        if (part === '..') parts.pop()
        else parts.push(part)
      }

      return `/${parts.join('/')}`
    }

    const isWritablePath = (path) => path === homeDirectory || path.startsWith(`${homeDirectory}/`)
    const parentPath = (path) => {
      const slash = path.lastIndexOf('/')
      return slash === 0 ? '/' : path.slice(0, slash)
    }
    const baseName = (path) => path.split('/').filter(Boolean).pop() || '/'
    const permissionString = (mode, type) => {
      const digits = String(mode || (type === 'directory' ? '755' : '644')).slice(-3).padStart(3, '0')
      const symbols = digits.split('').map((digit) => {
        const value = Number.parseInt(digit, 8)
        return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`
      }).join('')
      return `${type === 'directory' ? 'd' : '-'}${symbols}`
    }
    const requireDirectory = (path) => {
      const entry = fileSystem.get(path)
      if (!entry || entry.type !== 'directory') throw new Error(`Not a directory: ${path}`)
      return entry
    }
    const requireFile = (path) => {
      const entry = fileSystem.get(path)
      if (!entry) throw new Error(`No such file: ${path}`)
      if (entry.type !== 'file') throw new Error(`Is a directory: ${path}`)
      return entry
    }

    const tokenize = (line) => {
      const tokens = []
      let current = ''
      let quote = ''
      let escaped = false
      let tokenStarted = false

      for (let index = 0; index < line.length; index += 1) {
        const character = line[index]

        if (escaped) {
          current += character
          escaped = false
          tokenStarted = true
          continue
        }

        if (quote) {
          if (character === quote) quote = ''
          else if (character === '\\' && quote === '"') escaped = true
          else current += character
          tokenStarted = true
          continue
        }

        if (character === '"' || character === "'") {
          quote = character
          tokenStarted = true
          continue
        }

        if (character === '\\') {
          escaped = true
          tokenStarted = true
          continue
        }

        if (character === ';' || character === '|' || character === '&' || character === '<' || character === '`') {
          throw new Error('Shell operators and command substitution are not supported in this simulator.')
        }

        if (character === '$' && line[index + 1] === '(') {
          throw new Error('Command substitution is not supported in this simulator.')
        }

        if (character === '>') {
          if (line[index + 1] === '>') throw new Error('Append redirection is not supported. Use echo with a single > in this simulator.')
          if (tokenStarted) tokens.push(current)
          current = ''
          tokenStarted = false
          tokens.push('>')
          continue
        }

        if (/\s/.test(character)) {
          if (tokenStarted) tokens.push(current)
          current = ''
          tokenStarted = false
          continue
        }

        current += character
        tokenStarted = true
      }

      if (escaped || quote) throw new Error('Finish the quote or escape in your command.')
      if (tokenStarted) tokens.push(current)
      return tokens
    }

    const listDirectory = (path, flags) => {
      const entry = fileSystem.get(path)
      if (!entry) throw new Error(`No such file or directory: ${path}`)
      if (entry.type === 'file') return baseName(path)
      const showAll = flags.includes('a')
      const longFormat = flags.includes('l')
      const children = []

      for (const [childPath, child] of fileSystem.entries()) {
        if (childPath === path || parentPath(childPath) !== path) continue
        const name = baseName(childPath)
        if (!showAll && name.startsWith('.')) continue
          children.push(longFormat ? `${permissionString(child.mode, child.type)}  ${child.owner || 'learner'}  ${child.group || 'learners'}  ${name}` : name)
      }

      return children.length ? children.sort().join('\n') : '(empty directory)'
    }

    const createFile = (path, content = '') => {
      if (!isWritablePath(path)) throw new Error('The sandbox only allows file changes inside /home/learner.')
      const parent = fileSystem.get(parentPath(path))
      if (!parent || parent.type !== 'directory') throw new Error(`Parent directory does not exist: ${parentPath(path)}`)
      const existing = fileSystem.get(path)
      if (existing?.type === 'directory') throw new Error(`Is a directory: ${path}`)
      fileSystem.set(path, { type: 'file', content, mode: existing?.mode || '644', owner: existing?.owner || 'learner', group: existing?.group || 'learners' })
    }

    const createDirectory = (path, createParents) => {
      if (!isWritablePath(path)) throw new Error('The sandbox only allows directory changes inside /home/learner.')
      if (fileSystem.has(path)) {
        if (fileSystem.get(path).type === 'directory' && createParents) return
        throw new Error(`Already exists: ${path}`)
      }
      const segments = path.split('/').filter(Boolean)
      let currentPath = ''
      for (let index = 0; index < segments.length; index += 1) {
        currentPath += `/${segments[index]}`
        if (fileSystem.has(currentPath)) {
          if (fileSystem.get(currentPath).type !== 'directory') throw new Error(`Not a directory: ${currentPath}`)
          continue
        }
        if (!createParents && index !== segments.length - 1) throw new Error(`Parent directory does not exist: ${parentPath(currentPath)}`)
        if (!isWritablePath(currentPath)) throw new Error('The sandbox only allows directory changes inside /home/learner.')
        fileSystem.set(currentPath, { type: 'directory', content: '', mode: '755', owner: 'learner', group: 'learners' })
      }
    }

    const formatHelp = () => [
      'Available simulated commands:',
      '  pwd, ls, cd, mkdir, rmdir, touch, cat, less, head, tail, echo',
      '  cp, mv, rm, find, grep, chmod, chown, whoami, uname, date',
      '  ps, top, df, du, free, apt, dnf, systemctl, journalctl, man',
      '  ip, ss, ping, dig, nslookup, curl, clear, help',
      'Examples: ls -la, cat welcome.txt, mkdir practice, chmod 640 notes.txt',
      'Package commands are read-only; service and network output is simulated.',
      'Shell pipes and command chaining are not supported. Only echo > file is supported for redirection.',
      'File changes stay in this virtual filesystem. Network output is fictional.',
    ].join('\n')

    const execute = (tokens) => {
      const [command, ...args] = tokens
      if (!command) return ''

      if (command === 'help') return formatHelp()
      if (command === 'clear') {
        output.replaceChildren()
        return ''
      }
      if (command === 'pwd') return workingDirectory
      if (command === 'whoami') return 'learner'
      if (command === 'uname') return 'Linux practice-sandbox 6.x x86_64 GNU/Linux'
      if (command === 'date') return new Date().toString()
      if (command === 'ps') return 'PID  TTY  TIME  CMD\n101  pts/0  00:00  learning-shell (sample)\n204  pts/0  00:00  course-demo (sample)'
      if (command === 'top') return 'SIMULATED process snapshot\nPID  USER     CPU  MEM  COMMAND\n101  learner  0.0  1.2  learning-shell\nNo processes were inspected on this device.'
      if (command === 'man') {
        if (!args[0]) throw new Error('Usage: man command')
        return `Learning summary for ${args[0]}\nUse the command reference for syntax, examples, and safety notes. This simulator shows a short summary, not a system manual.`
      }
      if (command === 'apt' || command === 'dnf') {
        const action = args[0]
        if (!['search', 'show', 'info', 'list'].includes(action)) throw new Error(`Only read-only ${command} search/show/info/list examples are simulated. Package installation is disabled.`)
        if (action !== 'list' && !args[1]) throw new Error(`Usage: ${command} ${action} package-name`)
        return `SIMULATED ${command} ${args.join(' ')}\nSample package information only. No package manager was run and no software was changed.`
      }
      if (command === 'systemctl') {
        if (!['status', 'is-active'].includes(args[0])) throw new Error('Only systemctl status and is-active are simulated; services cannot be changed.')
        const unit = args[1] || 'sample.service'
        return args[0] === 'is-active' ? 'active (simulated)' : `● ${unit} - Example practice service\n   Loaded: loaded (sample only)\n   Active: active (simulated)`
      }
      if (command === 'journalctl') return 'SIMULATED journal excerpt\nINFO practice service ready\nINFO sample filesystem mounted\nNo system logs were accessed.'
      if (command === 'ss') return 'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nLISTEN 0      128    127.0.0.1:8080   0.0.0.0:* (sample only)'
      if (command === 'exit') return 'This is a page-based simulator. Close the tab when you are finished.'

      if (command === 'ls') {
        let flags = ''
        const paths = []
        for (const argument of args) {
          if (argument.startsWith('-') && argument !== '-') flags += argument.slice(1)
          else paths.push(argument)
        }
        const targets = paths.length ? paths : [workingDirectory]
        return targets.map((target) => listDirectory(normalizePath(target), flags)).join('\n')
      }

      if (command === 'cd') {
        if (args.length > 1) throw new Error('Usage: cd [directory]')
        const destination = normalizePath(args[0] || homeDirectory)
        requireDirectory(destination)
        workingDirectory = destination
        updatePrompt()
        return ''
      }

      if (command === 'mkdir') {
        const createParents = args.includes('-p')
        const paths = args.filter((argument) => argument !== '-p')
        if (!paths.length) throw new Error('Usage: mkdir [-p] directory')
        for (const path of paths) createDirectory(normalizePath(path), createParents)
        return ''
      }

      if (command === 'touch') {
        if (!args.length) throw new Error('Usage: touch file')
        for (const path of args) {
          const resolved = normalizePath(path)
          if (fileSystem.has(resolved) && fileSystem.get(resolved).type === 'directory') throw new Error(`Is a directory: ${resolved}`)
          const current = fileSystem.get(resolved)
          createFile(resolved, current?.content || '')
        }
        return ''
      }

      if (command === 'cat' || command === 'less' || command === 'head' || command === 'tail') {
        let lineCount = 10
        let fileArgument = args[0]
        if ((command === 'head' || command === 'tail') && args[0] === '-n') {
          lineCount = Number(args[1])
          fileArgument = args[2]
          if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 100) throw new Error('Choose a line count between 1 and 100.')
        }
        if (!fileArgument || args.length > (args[0] === '-n' ? 3 : 1)) throw new Error(`Usage: ${command} ${command === 'cat' ? 'file' : '[-n count] file'}`)
        const file = requireFile(normalizePath(fileArgument))
        const lines = file.content.split('\n')
        if (command === 'head') return lines.slice(0, lineCount).join('\n')
        if (command === 'tail') return lines.slice(-lineCount).join('\n')
        return file.content || '(empty file)'
      }

      if (command === 'echo') {
        const redirectIndex = args.indexOf('>')
        if (redirectIndex !== -1) {
          if (redirectIndex !== args.length - 2 || args.lastIndexOf('>') !== redirectIndex) throw new Error('Usage: echo text > file')
          const content = args.slice(0, redirectIndex).join(' ')
          createFile(normalizePath(args[redirectIndex + 1]), `${content}\n`)
          return ''
        }
        if (args.includes('>')) throw new Error('Usage: echo text > file')
        return args.join(' ')
      }

      if (command === 'cp' || command === 'mv') {
        if (args.length !== 2) throw new Error(`Usage: ${command} source destination`)
        const sourcePath = normalizePath(args[0])
        const source = requireFile(sourcePath)
        let destinationPath = normalizePath(args[1])
        const destination = fileSystem.get(destinationPath)
        if (destination?.type === 'directory') destinationPath = `${destinationPath}/${baseName(sourcePath)}`
        if (!isWritablePath(destinationPath)) throw new Error('The sandbox only allows file changes inside /home/learner.')
        if (command === 'mv') {
          if (!isWritablePath(sourcePath)) throw new Error('The sandbox only allows file changes inside /home/learner.')
          fileSystem.delete(sourcePath)
        }
        createFile(destinationPath, source.content)
        return ''
      }

      if (command === 'rm') {
        const recursive = args.includes('-r') || args.includes('-R')
        const interactive = args.includes('-i')
        const paths = args.filter((argument) => !['-r', '-R', '-f', '-i'].includes(argument))
        if (!paths.length) throw new Error('Usage: rm [-r] [-i] path')
        if (interactive) return 'SIMULATED: rm -i would ask before removal. No file was removed; use rm path to remove a virtual sample.'
        for (const path of paths) {
          const resolved = normalizePath(path)
          if (!isWritablePath(resolved) || resolved === homeDirectory) throw new Error('You can remove only sample items inside the virtual home directory.')
          const entry = fileSystem.get(resolved)
          if (!entry) throw new Error(`No such file or directory: ${resolved}`)
          if (entry.type === 'directory' && !recursive) throw new Error(`Is a directory: ${resolved} (try rm -r in this simulator)`)
          const descendants = Array.from(fileSystem.keys()).filter((candidate) => candidate === resolved || candidate.startsWith(`${resolved}/`))
          for (const descendant of descendants) fileSystem.delete(descendant)
        }
        return ''
      }

      if (command === 'rmdir') {
        if (!args.length) throw new Error('Usage: rmdir directory')
        for (const argument of args) {
          const path = normalizePath(argument)
          if (!isWritablePath(path) || path === homeDirectory) throw new Error('The sandbox only allows directory changes inside /home/learner.')
          requireDirectory(path)
          if (Array.from(fileSystem.keys()).some((candidate) => candidate !== path && parentPath(candidate) === path)) throw new Error(`Directory is not empty: ${path}`)
          fileSystem.delete(path)
        }
        return ''
      }

      if (command === 'chmod') {
        if (args.length !== 2) throw new Error('Usage: chmod mode file')
        const path = normalizePath(args[1])
        if (!isWritablePath(path)) throw new Error('The sandbox only allows permission changes inside /home/learner.')
        const entry = fileSystem.get(path)
        if (!entry) throw new Error(`No such file or directory: ${path}`)
        const currentMode = String(entry.mode || (entry.type === 'directory' ? '755' : '644')).slice(-3)
        let mode = args[0]
        if (/^[0-7]{3,4}$/.test(mode)) mode = mode.slice(-3)
        else if (mode === 'u+x' || mode === 'u-x') {
          const ownerBits = Number.parseInt(currentMode[0], 8)
          mode = `${(mode === 'u+x' ? ownerBits | 1 : ownerBits & ~1).toString(8)}${currentMode.slice(1)}`
        } else throw new Error('This simulator supports three-digit modes such as 640, 644, 755, and u+x.')
        fileSystem.set(path, { ...entry, mode })
        return `SIMULATED: ${path} now has mode ${mode} in the virtual filesystem.`
      }

      if (command === 'chown') {
        if (args.length !== 2) throw new Error('Usage: chown learner[:learners] path')
        if (!['learner', 'learner:learners'].includes(args[0])) throw new Error('The sample filesystem only contains learner:learners.')
        const path = normalizePath(args[1])
        if (!isWritablePath(path)) throw new Error('The sandbox only allows ownership changes inside /home/learner.')
        const entry = fileSystem.get(path)
        if (!entry) throw new Error(`No such file or directory: ${path}`)
        fileSystem.set(path, { ...entry, owner: 'learner', group: 'learners' })
        return `SIMULATED: ownership for ${path} is learner:learners in the virtual filesystem.`
      }

      if (command === 'find') {
        const nameIndex = args.indexOf('-name')
        if (nameIndex === -1 || !args[nameIndex + 1]) throw new Error('Usage: find [path] -name pattern')
        const start = normalizePath(nameIndex === 1 ? args[0] : '.')
        requireDirectory(start)
        const pattern = args[nameIndex + 1]
        const expression = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
        const matches = Array.from(fileSystem.keys()).filter((path) => path !== start && path.startsWith(`${start}/`) && expression.test(baseName(path)))
        return matches.length ? matches.join('\n') : '(no matches)'
      }

      if (command === 'grep') {
        const options = args.filter((argument) => argument.startsWith('-'))
        const values = args.filter((argument) => !argument.startsWith('-'))
        if (values.length !== 2 || options.some((option) => !['-n', '-i'].includes(option))) throw new Error('Usage: grep [-n] [-i] pattern file')
        const [pattern, filePath] = values
        const content = requireFile(normalizePath(filePath)).content
        const searchPattern = options.includes('-i') ? pattern.toLocaleLowerCase() : pattern
        const matches = content.split('\n').flatMap((line, index) => {
          const searchable = options.includes('-i') ? line.toLocaleLowerCase() : line
          return searchable.includes(searchPattern) ? [options.includes('-n') ? `${index + 1}:${line}` : line] : []
        })
        return matches.length ? matches.join('\n') : '(no matching lines)'
      }

      if (command === 'df') return 'Filesystem      Size  Used  Avail  Use%  Mounted on\n/dev/sample     80G   32G   44G    43%   /'
      if (command === 'free') return '               total        used        free\nMem:            8Gi        2.1Gi       3.8Gi\nSwap:           2Gi        0Gi         2Gi'
      if (command === 'du') {
        const target = normalizePath(args.filter((argument) => !argument.startsWith('-'))[0] || '.')
        if (!fileSystem.has(target)) throw new Error(`No such file or directory: ${target}`)
        return `8.0K\t${target}`
      }

      if (command === 'ip') {
        if (args[0] === 'address' || args[0] === 'addr') return '1: lo: <LOOPBACK,UP>\n    inet 127.0.0.1/8\n2: eth0: <BROADCAST,MULTICAST,UP>\n    inet 192.0.2.24/24  (documentation sample)'
        if (args[0] === 'route') return 'default via 192.0.2.1 dev eth0  (documentation sample)'
        throw new Error('Try: ip address show  |  ip route')
      }

      if (command === 'ping') {
        const host = args.filter((argument) => argument !== '-c' && !/^\d+$/.test(argument))[0]
        if (!host) throw new Error('Usage: ping [-c count] host')
        return `SIMULATED: 3 sample replies for ${host}; average round-trip 12.4 ms. No packets were sent.`
      }

      if (command === 'dig' || command === 'nslookup') {
        const name = args.find((argument) => !argument.startsWith('-') && !['A', 'AAAA', 'MX', 'TXT'].includes(argument.toUpperCase()))
        if (!name) throw new Error(`Usage: ${command} name`)
        return command === 'dig'
          ? `; <<>> simulated dig <<>> ${name}\n;; ANSWER SECTION:\n${name}.  300  IN  A  192.0.2.10\n;; Sample only. No DNS query was sent.`
          : `Server:  sample-resolver\nName:    ${name}\nAddress: 192.0.2.10\n(Simulated result; no DNS query was sent.)`
      }

      if (command === 'curl') {
        const url = args.find((argument) => !argument.startsWith('-'))
        if (!url) throw new Error('Usage: curl [options] URL')
        return `SIMULATED response for ${url}\nHTTP/2 200\ncontent-type: text/html\nNo live request was made.`
      }

      throw new Error(`Command not available: ${command}. Type help to see the documented allowlist.`)
    }

    const resetSandbox = (showMessage = true) => {
      fileSystem = createFileSystem()
      workingDirectory = homeDirectory
      commandHistory = []
      historyPosition = 0
      output.replaceChildren()
      updatePrompt()
      if (showMessage) appendEntry('Sandbox reset. Sample files restored; no real files were changed.', 'success')
      input.value = ''
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const commandText = input.value.trim()
      input.value = ''
      if (!commandText) return

      commandHistory.push(commandText)
      historyPosition = commandHistory.length
      appendCommand(commandText)

      try {
        const result = execute(tokenize(commandText))
        if (result) appendEntry(result)
      } catch (error) {
        appendEntry(error instanceof Error ? error.message : 'Unable to parse that command.', 'error')
      }
    })

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return }
        event.preventDefault()
        form.requestSubmit()
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (historyPosition > 0) historyPosition -= 1
        input.value = commandHistory[historyPosition] || ''
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (historyPosition < commandHistory.length) historyPosition += 1
        input.value = commandHistory[historyPosition] || ''
      }
    })

    resetButton.addEventListener('click', () => resetSandbox())

    document.querySelectorAll('[data-fill-command]').forEach((button) => {
      button.addEventListener('click', () => {
        input.value = button.dataset.fillCommand || ''
        input.focus()
      })
    })

    resetSandbox(false)
    appendEntry('Welcome. Type help to see the documented simulated commands.')
  }

  function initializeNotes() {
    const form = getById('note-form')
    const list = getById('notes-list')
    if (!form || !list) return

    const titleInput = getById('note-title')
    const topicInput = getById('note-topic')
    const contentInput = getById('note-content')
    const idInput = getById('note-id')
    const searchInput = getById('notes-search')
    const status = getById('notes-status')
    const message = getById('notes-message')
    const empty = getById('notes-empty')
    const noResults = getById('notes-no-results')
    const saveButton = getById('save-note')
    const cancelButton = getById('cancel-edit')
    let database
    let notes = []

    const openDatabase = () => new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('This browser does not support IndexedDB, so notes are unavailable here.'))
        return
      }

      const request = window.indexedDB.open('linux-learning-hub-notes', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Could not open the local notes database.'))
      request.onblocked = () => reject(new Error('The notes database is busy in another tab. Close the other tab and try again.'))
    })

    const setMessage = (text, isError = false) => {
      message.textContent = text
      message.classList.toggle('feedback-incorrect', isError)
      message.classList.toggle('feedback-correct', !isError && Boolean(text))
    }

    const resetEditor = () => {
      form.reset()
      idInput.value = ''
      saveButton.textContent = 'Save note'
      cancelButton.hidden = true
      getById('note-form-heading').textContent = 'Create a note'
    }

    const formatDate = (timestamp) => {
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp))
      } catch {
        return 'Recently updated'
      }
    }

    const renderNotes = () => {
      list.replaceChildren()
      const query = searchInput.value.trim().toLocaleLowerCase()
      const filtered = notes.filter((note) => `${note.title} ${note.content} ${note.topic}`.toLocaleLowerCase().includes(query))

      for (const note of filtered) {
        const article = document.createElement('article')
        article.className = 'note-item'

        const tag = document.createElement('span')
        tag.className = 'tag tag-accent'
        tag.textContent = note.topic

        const title = document.createElement('h3')
        title.textContent = note.title

        const content = document.createElement('p')
        content.textContent = note.content

        const meta = document.createElement('div')
        meta.className = 'note-item-meta'
        const updated = document.createElement('span')
        updated.textContent = `Updated ${formatDate(note.updatedAt)}`

        const actions = document.createElement('div')
        actions.className = 'note-actions'
        const editButton = document.createElement('button')
        editButton.className = 'button button-quiet button-small'
        editButton.type = 'button'
        editButton.textContent = 'Edit'
        editButton.dataset.noteAction = 'edit'
        editButton.dataset.noteId = String(note.id)
        const deleteButton = document.createElement('button')
        deleteButton.className = 'button button-quiet button-small'
        deleteButton.type = 'button'
        deleteButton.textContent = 'Delete'
        deleteButton.dataset.noteAction = 'delete'
        deleteButton.dataset.noteId = String(note.id)

        actions.append(editButton, deleteButton)
        meta.append(updated, actions)
        article.append(tag, title, content, meta)
        list.append(article)
      }

      empty.hidden = notes.length !== 0
      noResults.hidden = notes.length === 0 || filtered.length !== 0
      status.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} saved on this device.`
    }

    const refreshNotes = () => new Promise((resolve, reject) => {
      const transaction = database.transaction('notes', 'readonly')
      const request = transaction.objectStore('notes').getAll()
      request.onsuccess = () => {
        notes = request.result.sort((left, right) => right.updatedAt - left.updatedAt)
        renderNotes()
        resolve()
      }
      request.onerror = () => reject(request.error || new Error('Could not read saved notes.'))
    })

    const saveNote = (note) => new Promise((resolve, reject) => {
      const transaction = database.transaction('notes', 'readwrite')
      const store = transaction.objectStore('notes')
      if (note.id) store.put(note)
      else store.add(note)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this note.'))
      transaction.onabort = () => reject(transaction.error || new Error('Saving was cancelled.'))
    })

    const deleteNote = (id) => new Promise((resolve, reject) => {
      const transaction = database.transaction('notes', 'readwrite')
      transaction.objectStore('notes').delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete this note.'))
    })

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      if (!database) {
        setMessage('Local notes are not available in this browser.', true)
        return
      }

      const existing = notes.find((note) => note.id === Number(idInput.value))
      const note = {
        title: titleInput.value.trim(),
        topic: topicInput.value,
        content: contentInput.value.trim(),
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
      if (idInput.value) note.id = Number(idInput.value)

      try {
        await saveNote(note)
        await refreshNotes()
        resetEditor()
        setMessage('Note saved on this device.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save your note.', true)
      }
    })

    list.addEventListener('click', async (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-note-action]') : null
      if (!button || !database) return
      const note = notes.find((item) => item.id === Number(button.dataset.noteId))
      if (!note) return

      if (button.dataset.noteAction === 'edit') {
        idInput.value = String(note.id)
        titleInput.value = note.title
        topicInput.value = note.topic
        contentInput.value = note.content
        saveButton.textContent = 'Update note'
        cancelButton.hidden = false
        getById('note-form-heading').textContent = 'Edit a note'
        setMessage('Editing your note.')
        titleInput.focus()
        return
      }

      if (button.dataset.noteAction === 'delete' && window.confirm(`Delete “${note.title}” from this device?`)) {
        try {
          await deleteNote(note.id)
          await refreshNotes()
          if (Number(idInput.value) === note.id) resetEditor()
          setMessage('Note deleted from this device.')
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not delete your note.', true)
        }
      }
    })

    searchInput.addEventListener('input', renderNotes)
    cancelButton.addEventListener('click', () => {
      resetEditor()
      setMessage('Edit cancelled.')
      titleInput.focus()
    })

    openDatabase()
      .then((db) => {
        database = db
        return refreshNotes()
      })
      .catch((error) => {
        status.textContent = error instanceof Error ? error.message : 'Local notes are not available.'
        empty.hidden = true
      })
  }

  const questionBank = [
    { topic: 'linux', question: 'Which command prints the current working directory?', options: ['pwd', 'cd', 'whoami', 'ls'], correct: 0, explanation: 'pwd prints the absolute path of your current directory.', lesson: '/linux-course.html#terminal' },
    { topic: 'linux', question: 'In a Linux path, what does .. refer to?', options: ['The root directory', 'The parent directory', 'The current user', 'A hidden file'], correct: 1, explanation: '.. is the parent of the current directory.', lesson: '/linux-course.html#filesystem' },
    { topic: 'linux', question: 'Which statement best describes a Linux distribution?', options: ['A file permission', 'A kernel plus tools, packages, and a release process', 'A type of network port', 'A shell command'], correct: 1, explanation: 'A distribution packages the Linux kernel with system tools, software, and release/support choices.', lesson: '/linux-course.html#overview' },
    { topic: 'commands', question: 'In the practice folder, what does pwd print when the prompt shows learner@practice:~$?', options: ['/home/learner', '/etc', '/home', 'learner'], correct: 0, explanation: 'The ~ prompt represents /home/learner, so pwd prints that absolute path.', lesson: '/linux-course.html#terminal' },
    { topic: 'commands', question: 'Which command searches file contents for matching text?', options: ['find', 'grep', 'pwd', 'chmod'], correct: 1, explanation: 'grep searches lines of text for a pattern; find searches directory trees for files.', lesson: '/commands.html' },
    { topic: 'commands', question: 'What should you verify before using rm on a real system?', options: ['Only the current time', 'The exact path and what it contains', 'The screen brightness', 'The network name'], correct: 1, explanation: 'rm can remove files without sending them to a recycle bin. Check the target carefully.', lesson: '/commands.html' },
    { topic: 'commands', question: 'What does chmod 640 allow the owner to do?', options: ['Read and write', 'Read, write, and execute', 'Read only', 'Nothing'], correct: 0, explanation: '6 is 4 + 2: read and write. The group gets read (4), and others get no permissions (0).', lesson: '/linux-course.html#permissions' },
    { topic: 'networking', question: 'Which protocol commonly provides a device with IP configuration automatically?', options: ['DNS', 'DHCP', 'HTTP', 'USB'], correct: 1, explanation: 'DHCP can lease an IP address, gateway, and DNS resolver settings to a device.', lesson: '/networking.html#http-dns-dhcp' },
    { topic: 'networking', question: 'What does DNS primarily help a device do?', options: ['Translate a name into records such as IP addresses', 'Encrypt every network packet', 'Assign a Wi-Fi password', 'Format a USB drive'], correct: 0, explanation: 'DNS stores and resolves names to records, including IP addresses.', lesson: '/networking.html#http-dns-dhcp' },
    { topic: 'networking', question: 'Which model has seven layers?', options: ['TCP/IP model', 'OSI model', 'DHCP model', 'Ethernet model'], correct: 1, explanation: 'The OSI reference model has seven layers; TCP/IP is commonly taught with four.', lesson: '/networking.html#models' },
    { topic: 'networking', question: 'What does HTTPS add to HTTP?', options: ['TLS protection for the connection', 'Automatic malware removal', 'A different type of USB connector', 'An IP address lease'], correct: 0, explanation: 'HTTPS uses TLS to protect HTTP traffic in transit and help verify the server identity.', lesson: '/networking.html#http-dns-dhcp' },
    { topic: 'networking', question: 'Does USB-C by itself guarantee a specific data speed?', options: ['Yes, it always means the fastest speed', 'No, it describes a connector shape', 'Yes, it means USB 2.0 only', 'No, it is a wireless standard'], correct: 1, explanation: 'USB-C describes a connector shape. Capabilities depend on the devices, cable, and supported standard.', lesson: '/networking.html#usb' },
    { topic: 'networking', question: 'What is the role of a default gateway?', options: ['Edit files on a device', 'Forward traffic toward other networks', 'Resolve every domain name', 'Create a Bluetooth pairing'], correct: 1, explanation: 'A default gateway is the next hop used when a destination is outside the local subnet.', lesson: '/networking.html#routing' },
  ]

  function initializeQuizzes() {
    const selector = getById('quiz-topic')
    const startButton = getById('quiz-restart')
    const questionTitle = getById('quiz-question')
    const optionsContainer = getById('quiz-options')
    const feedback = getById('quiz-feedback')
    const nextButton = getById('quiz-next')
    const progressLabel = getById('quiz-progress-label')
    const progressMeter = getById('quiz-progress-fill')
    const scoreLabel = getById('quiz-score')
    const status = getById('quiz-status')
    if (!selector || !startButton || !questionTitle || !optionsContainer || !feedback || !nextButton || !progressMeter) return

    let activeQuestions = []
    let currentIndex = 0
    let score = 0
    let answered = false
    let finished = true

    const updateProgress = () => {
      const completedQuestions = currentIndex + (answered ? 1 : 0)
      const percentage = activeQuestions.length ? Math.round((completedQuestions / activeQuestions.length) * 100) : 0
      progressMeter.value = percentage
      progressMeter.textContent = `${percentage}%`
      if (progressLabel) progressLabel.textContent = activeQuestions.length ? `Question ${Math.min(currentIndex + 1, activeQuestions.length)} of ${activeQuestions.length}` : 'Ready'
    }

    const renderQuestion = () => {
      const item = activeQuestions[currentIndex]
      if (!item) return
      answered = false
      questionTitle.textContent = item.question
      optionsContainer.replaceChildren()
      feedback.textContent = 'Choose one answer to see an explanation.'
      feedback.className = 'quiz-feedback'
      scoreLabel.textContent = `Score: ${score}`
      nextButton.disabled = true
      nextButton.textContent = currentIndex === activeQuestions.length - 1 ? 'See results' : 'Next question'
      updateProgress()

      item.options.forEach((optionText, optionIndex) => {
        const label = document.createElement('label')
        label.className = 'quiz-option'
        const input = document.createElement('input')
        input.type = 'radio'
        input.name = 'quiz-answer'
        input.value = String(optionIndex)
        input.id = `quiz-answer-${optionIndex}`
        const text = document.createElement('span')
        text.textContent = optionText
        label.htmlFor = input.id
        label.append(input, text)
        input.addEventListener('change', () => {
          if (answered) return
          answered = true
          const isCorrect = optionIndex === item.correct
          if (isCorrect) score += 1
          optionsContainer.querySelectorAll('input').forEach((choice) => { choice.disabled = true })
          const labels = Array.from(optionsContainer.querySelectorAll('.quiz-option'))
          labels[item.correct]?.classList.add('is-correct')
          if (!isCorrect) label.classList.add('is-incorrect')
          feedback.textContent = `${isCorrect ? 'Correct.' : 'Not quite.'} ${item.explanation}`
          feedback.classList.add(isCorrect ? 'feedback-correct' : 'feedback-incorrect')
          scoreLabel.textContent = `Score: ${score}`
          status.textContent = isCorrect ? 'Answer recorded: correct.' : 'Answer recorded: review the explanation.'
          nextButton.disabled = false
          updateProgress()
        })
        optionsContainer.append(label)
      })
    }

    const finishQuiz = () => {
      finished = true
      questionTitle.textContent = 'Quiz complete'
      optionsContainer.replaceChildren()
      const summary = document.createElement('p')
      summary.className = 'quiz-result-summary'
      summary.textContent = `You answered ${score} of ${activeQuestions.length} correctly.`
      optionsContainer.append(summary)
      feedback.textContent = score === activeQuestions.length
        ? 'Excellent work. Try another topic or revisit the lessons for a deeper review.'
        : 'Review the linked lessons, then try this quiz again to strengthen your understanding.'
      feedback.className = `quiz-feedback ${score === activeQuestions.length ? 'feedback-correct' : 'feedback-incorrect'}`
      scoreLabel.textContent = `Final score: ${score} / ${activeQuestions.length}`
      progressLabel.textContent = 'Complete'
      progressMeter.value = 100
      progressMeter.textContent = '100%'
      nextButton.disabled = true
      nextButton.textContent = 'Complete'
      startButton.textContent = 'Try again'
      status.textContent = `Quiz complete. Final score: ${score} out of ${activeQuestions.length}.`
    }

    const startQuiz = () => {
      const topic = selector.value
      activeQuestions = questionBank.filter((question) => topic === 'all' || question.topic === topic)
      currentIndex = 0
      score = 0
      finished = false
      startButton.textContent = 'Restart quiz'
      status.textContent = `${activeQuestions.length} questions ready.`
      if (activeQuestions.length) renderQuestion()
    }

    startButton.addEventListener('click', startQuiz)
    selector.addEventListener('change', () => {
      status.textContent = 'Topic selected. Start the quiz when you are ready.'
    })
    nextButton.addEventListener('click', () => {
      if (!answered || finished) return
      if (currentIndex === activeQuestions.length - 1) {
        finishQuiz()
        return
      }
      currentIndex += 1
      renderQuestion()
    })

    const requestedTopic = new URLSearchParams(window.location.search).get('topic')
    if (requestedTopic === 'linux' || requestedTopic === 'commands' || requestedTopic === 'networking') selector.value = requestedTopic
  }

  function initializeDemoAuthentication() {
    const loginForm = getById('login-form')
    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault()
        const message = getById('login-message')
        if (!loginForm.reportValidity()) return
        message.textContent = 'Demo only: no sign-in was performed. Do not enter a real password here.'
        message.classList.add('feedback-incorrect')
      })
    }

    const signupForm = getById('signup-form')
    if (signupForm) {
      signupForm.addEventListener('submit', (event) => {
        event.preventDefault()
        const message = getById('signup-message')
        const password = getById('signup-password')
        const confirmation = getById('signup-confirm')
        if (!signupForm.reportValidity()) return
        if (password.value !== confirmation.value) {
          message.textContent = 'The passwords do not match. Please check both fields.'
          message.classList.add('feedback-incorrect')
          confirmation.focus()
          return
        }
        message.textContent = 'Demo only: no account was created and no password was stored.'
        message.classList.add('feedback-incorrect')
      })
    }
  }

  function initializePasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = getById(button.dataset.togglePassword)
        if (!input) return
        const showing = input.type === 'text'
        input.type = showing ? 'password' : 'text'
        button.textContent = showing ? 'Show' : 'Hide'
        button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password')
      })
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation()
    initializeCommandSearch()
    initializeTerminal()
    initializeNotes()
    initializeQuizzes()
    initializeDemoAuthentication()
    initializePasswordToggles()
  })
})()
