# Contributing to Football Ad Muter

First off, thank you for considering contributing to Football Ad Muter! It's people like you that make this extension better for everyone.

## Code of Conduct

This project and everyone participating in it is governed by respect, kindness, and constructive collaboration. By participating, you are expected to uphold these values.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (URLs, video sites, etc.)
- **Describe the behavior you observed and what you expected**
- **Include screenshots or GIFs** if applicable
- **Include your environment details:**
  - Browser version (Chrome/Edge/etc.)
  - Operating System
  - Extension version
  - Whether using Ollama or Transformers.js mode

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List some examples** of how it would work

### Pull Requests

1. **Fork the repo** and create your branch from `master`
2. **Make your changes** following the code style of the project
3. **Test your changes** thoroughly:
   - Test on multiple video streaming sites
   - Verify both Ollama and Transformers.js modes work
   - Check that existing functionality isn't broken
4. **Update documentation** if you're changing functionality
5. **Write clear commit messages** describing what and why
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Chrome browser
- (Optional) Ollama for API mode testing

### Setup Steps

1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Football-Ad-Muter.git
   cd Football-Ad-Muter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

### Development Workflow

- **Watch mode** for automatic rebuilds:
  ```bash
  npm run watch
  ```

- **Development build** (faster, includes source maps):
  ```bash
  npm run build:dev
  ```

- **Production build**:
  ```bash
  npm run build
  ```

### Code Structure

```
src/
├── background.js       # Service worker, handles AI model inference
├── content.js          # Injected into web pages, captures video frames
├── popup.js            # Extension popup UI logic
├── request-queue.js    # API request queueing and rate limiting
└── adaptive-sampler.js # Intelligent frame capture timing
```

### Coding Guidelines

- **Follow existing code style** - we use clear, readable JavaScript
- **Comment complex logic** - especially AI/ML related code
- **Preserve messaging contracts** - don't break existing message types
- **Handle errors gracefully** - users should see helpful messages
- **Log appropriately** - use `console.log` with clear prefixes
- **Test cross-browser** - Chrome is primary but keep compatibility in mind

### Testing

Before submitting a PR:

1. **Test on real streaming sites:**
   - YouTube (various sports content)
   - Twitch
   - ESPN
   - Other sports streaming platforms

2. **Test both modes:**
   - Ollama API mode (if you have it set up)
   - Transformers.js browser mode

3. **Test error conditions:**
   - No video on page
   - Video loading states
   - API failures
   - Network interruptions

4. **Check browser console** for errors in:
   - Page console (F12)
   - Extension popup console
   - Service worker console (chrome://extensions → Inspect)

## Specific Areas for Contribution

### High Priority

- **Improve ad detection accuracy** - better prompts, models, or logic
- **Support more streaming platforms** - Hulu, Amazon Prime, etc.
- **Performance optimizations** - reduce CPU/memory usage
- **Better error messages** - help users diagnose issues

### Medium Priority

- **UI improvements** - better popup design and controls
- **Statistics tracking** - mute/unmute events, accuracy metrics
- **Configuration options** - more user control over behavior
- **Documentation** - tutorials, architecture docs, FAQs

### Good First Issues

Look for issues labeled `good first issue` - these are specifically chosen to be approachable for newcomers to the project.

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

## Recognition

Contributors will be recognized in the README and release notes. Thank you for making Football Ad Muter better!
