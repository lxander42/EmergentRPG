# Contributing to Emergent RPG

Thanks for your interest in contributing!  
This project is early-stage and experimental, and we value clarity, curiosity, and collaboration.

**Resources**: 
- [Unity Download](https://unity.com/download)
- [Github desktop](https://desktop.github.com/download/)
- [Cloning a repo](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [1Password SSH](https://developer.1password.com/docs/ssh/get-started/?utm_medium=organic&utm_source=oph&utm_campaign=windows)
- [Generating an SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)

---

## Quick Start

- Downlad and install latest version of unity [Unity](https://unity.com/download)
- Clone repo to folder of your choice
- Open project ![Open project](ASSETS\DOCUMENTATION\openproject.png)
- 

## General Guidelines

- Keep changes focused and easy to review
- Prefer small, incremental pull requests
- Document systems, assumptions, and intent
- Expect iteration — ideas may evolve or be discarded

If you're unsure about direction, open an issue or draft PR early.

---

## Branching Model

- **main**
  - Protected
  - Must always remain stable

- **dev**
  - Active development branch
  - Create feature branches off `dev`
  - Periodically merged into `main` when stable

---

## Signed Commits (Required)

All commits **must be signed**.

Signed commits help maintain authorship clarity and accountability as the project grows.

### How to Sign Commits

Sign a commit manually:

```bash
git commit -S -m "Your commit message"
```

Or configure Git to sign all commits by default:

```bash
git config --global commit.gpgsign true
```

Pull requests containing unsigned commits may be rejected or asked to be amended.

## Pull Requests

- Open pull requests against the dev branch
- Clearly describe what you changed and why
- Reference related issues or spec documents when applicable
- Ensure all commits are signed before requesting review

## Code & Design Philosophy

- Favor systems over scripts
- Favor data-driven design
- Optimize for emergent behavior, not hard-coded outcomes
- Avoid premature optimization

## Questions & Discussion

If something is unclear or you want feedback:
- Open an issue
- Start a discussion
- Ask early — this project is meant to evolve collaboratively