# Cangjie VS Code Extension

## Overview

The Cangjie language provides an extension for Visual Studio Code (VS Code). Together with the Cangjie SDK, the extension provides language services, project management, build, debugging, formatting, static analysis, and code coverage capabilities.

For more information, see the [User Guide](https://gitcode.com/Cangjie/vscode_cangjie/blob/main/docs/summary_cjnative.md).

## Requirements

- Visual Studio Code 1.65 or later

> On Windows, source file names and paths containing Chinese characters are not supported.
>
> Source file names and paths should follow the Cangjie programming conventions. Characters other than `[0-9a-zA-Z_]` are not recommended and will be replaced with `=`.

## Installation

Download and install the [Cangjie SDK](https://cangjie-lang.cn/en/download). For the best compatibility, use the same version of the SDK and the extension.

The current extension supports the Cangjie LTS release. If you use an STS release, go to the corresponding STS download page, download the matching extension, and install it manually.

### Configure the SDK Path

1. Click the gear icon in the lower-left corner and select **Settings**. Search for `Cangjie`, then select **Cangjie Language Support** in the sidebar.
2. Find **Cangjie Sdk: Option** and select `CJNative` as the backend type. This is the default option.
3. Find **Cangjie Sdk Path: CJNative Backend** and enter the absolute path to the CJNative SDK directory.
4. Restart VS Code for the configuration to take effect.

If the SDK path for the selected backend is empty, the extension uses the `CANGJIE_HOME` environment variable as the SDK directory. An explicitly configured SDK path takes precedence over `CANGJIE_HOME`.

## Usage

### Create a Cangjie Project

In VS Code, press `F1` or `Ctrl+Shift+P` (`Command+Shift+P` on macOS) to open the Command Palette. Run `Cangjie: Create Cangjie Project` or `Cangjie: Create Cangjie Project View` to create a Cangjie project.

A Cangjie project has the following directory structure:

```text
Project_name: the name entered by the developer

├── src: source directory
│   └── main.cj: source file
└── cjpm.toml: default cjpm.toml configuration file
```

### Language Services

The extension provides the following language features:

- **Syntax highlighting** - Highlights operators, classes, comments, functions, keywords, numbers, package names, strings, variables, and other language elements.
- **Code completion** - Displays completion suggestions when you enter a keyword, variable, or `.`. Use the up and down arrow keys to select an item, then press `Enter` or `Tab` to insert it. You may need to switch to the system's default input method when using the arrow keys.
- **Go to definition** - Hold `Ctrl` and click a symbol, right-click it and select **Go to Definition**, or press `F12`.
- **Find references** - Right-click a symbol and select **Find All References** to preview its references. Select a result to navigate to it.
- **Diagnostics** - Code that violates Cangjie syntax or semantic rules is marked with a red squiggly underline. Hover over the code to view the diagnostic message. The diagnostic disappears after the issue is corrected.
- **Document highlights** - Place the cursor on a variable or function name to highlight its declaration and usages in the current file.
- **Hover information** - Hover over a variable to view its type information.
- **Workspace symbol search** - Press `Ctrl+T` and enter a symbol name. Select a result to navigate to its definition.
- **Rename symbol** - Place the cursor on a custom identifier, right-click and select **Rename Symbol**, or press `F2`.
- **Outline view** - Displays the outline of the current file in the **OUTLINE** view. Two levels are currently supported: top-level declarations, followed by constructors and members.
- **Breadcrumb navigation** - Place the cursor on a symbol and use the breadcrumbs to view the symbol's location in the current file and project.
- **Signature help** - Enter `(` or `,` in a function call to display parameter information and highlight the current parameter. Signature help remains visible while the cursor is within the argument list and can be shown together with code completion.
- **Type hierarchy** - Place the cursor on a custom type, right-click, and select **Show Type Hierarchy**. The hierarchy is displayed in the left sidebar. `Object`, the default parent of all classes, is not displayed.
- **Call hierarchy** - Place the cursor on a function name, right-click, and select **Show Call Hierarchy**. The call hierarchy is displayed in the left sidebar.

### Build

#### Build a Project

The visual build features in VS Code depend on `cjpm`. The Cangjie module opened in VS Code must contain a valid `cjpm.toml` file. If the file is unavailable, use the `cjc` command in the terminal to build the project.

- Open the VS Code Command Palette, enter `Cangjie`, and run a build-related command.
- Run `cjpm` commands in the VS Code terminal.
- Click the run button in a `.cj` editor to run the entire Cangjie project.
- Click the hammer button in a `.cj` editor to build the entire Cangjie project.

#### Configure Build Options

- Edit `cjpm.toml` and `cjpm_build_args.json` directly.
- Run `Cangjie: Edit Configuration (UI)` from the VS Code Command Palette to open the visual configuration editor.
- Click the edit button in the upper-right corner of the editor to open the visual configuration editor.

#### Import Third-Party Libraries

- Edit the target-related dependency settings in `cjpm.toml` and `cjpm_build_args.json` directly.
- Use the **CANGJIE LIBRARY** view in the Explorer to inspect, import, or remove third-party libraries.

### Debugging

The Cangjie extension provides visual debugging with the following capabilities:

- Launch a debug process.
- Attach to a running process.
- Source, function, data, and instruction breakpoints.
- Source-level stepping, run to cursor, step in, step out, continue, pause, restart, and stop.
- Cangjie-C interoperability debugging, including continuing from Cangjie code and stepping into C code.
- Instruction-level stepping, step in, and step out.
- Expression evaluation.
- Inspecting and modifying variables.
- Inspecting variables in the Debug Console.
- Viewing program output.
- Reverse debugging.
- Running and debugging unit tests.

#### Start Debugging

##### Launch

**Debug a Cangjie project**

- If `launch.json` does not exist, press `F5` or select **Run and Debug > Cangjie(cjdb) Debug** to start debugging.
- If `launch.json` already exists, select **Add Configuration > Cangjie Debug (CJNative) : launch > Build And Debug Cangjie Project** in `launch.json`, then start debugging with the added configuration.

**Debug a single file**

Select the Cangjie source file to debug, right-click it, and select `Cangjie: Build and Debug File`. The extension generates the `task.json` build configuration and build script, runs the script according to `task.json`, produces a debuggable binary, and starts the debugger.

##### Attach

1. In `launch.json`, select **Add Configuration > Cangjie Debug (CJNative) : attach**, then start debugging with the added configuration.
2. Select the target process in the process picker.

#### Run and Debug Unit Tests

Click the `run | debug` CodeLens above an `@Test` or `@TestCase` declaration to run or debug the corresponding test class or test case.

### Command-Line Tool Integration

#### Formatting

- For a Cangjie file, right-click in the editor and select `[Cangjie] Format`, or press `Ctrl+Alt+F`.
- For a Cangjie project, select a file or right-click a folder in the Explorer and run `[Cangjie] Format`.

#### Static Analysis

- Right-click in the editor and select `[Cangjie] CodeCheck`, or press `Ctrl+Alt+C`.
- Right-click a file or folder in the Explorer and select `[Cangjie] CodeCheck`.

#### Code Coverage

- Right-click in the editor and select `[Cangjie] Coverage`, or press `Ctrl+Alt+G`, to generate a coverage report for the current Cangjie file.
- Select a file or right-click a folder in the Explorer and run `[Cangjie] Coverage` to generate a coverage report for the selected file or folder.

## Related Links

- [Cangjie website](https://cangjie-lang.cn/en/)
- [Download the Cangjie SDK](https://cangjie-lang.cn/en/download)
- [Extension documentation](https://gitcode.com/Cangjie/vscode_cangjie/blob/main/docs/summary_cjnative.md)

## License

This extension is licensed under the Apache License 2.0. See [LICENSE](https://atomgit.com/Cangjie/vscode_cangjie/blob/main/LICENSE) for details.
