# g3n-electron-webcam-agents

Electron + React boilerplate for webcam agents.

## Overview

This project is an Electron app that lets you create and manage multiple AI agents (personas) to analyze webcam footage in real time using Google's Gemma 3n multimodal model. Each agent can be customized for a specific detection or description task (e.g., fire detection, face detection, scene description).

Agents process webcam frames in parallel, and their findings are displayed in the UI. The app is privacy-first and runs fully offline.

## Features

- **Multi-agent support:** Create, edit, pause, and remove agents with custom prompts and purposes.
- **Webcam detection:** Agents only run if a webcam is detected. If the webcam disconnects, all agents are paused automatically.
- **Agent status:** See real-time status for each agent (initialized, running, paused, error).
- **Parallel processing:** Each agent analyzes frames independently for fast, focused results.
- **Error handling:** Robust feedback for model errors, webcam issues, and agent problems.
- **Offline & private:** All processing is local; no data leaves your device.

## Getting Started

- `npm install`
- `npm run start`

## Project Structure

- `app/` - Electron output (main, preload, assets)
- `src/` - Source code (React, Electron main/preload)
- `build/` - Webpack configs and dev scripts
- `public/` - Static assets (favicon, etc)

## Usage

1. Start the app and ensure your webcam is connected.
2. Add agents with custom prompts (e.g., "Detect fire", "Describe scene").
3. View agent results and statuses in the UI.
4. If the webcam disconnects, agents will pause automatically.
5. Troubleshoot errors using the status and error messages shown for each agent.

## Troubleshooting

- **Webcam not detected:** Ensure your webcam is connected and accessible. Agents will not run without a webcam.
- **Model errors (e.g., ONNX issues):** Check your HuggingFace cache and model files. See logs for details.
- **Agent stuck in error:** Remove and re-add the agent, or restart the app.

## License
MIT

---

## Kaggle Challenge Context

This project is an entry for the [Google Gemma 3n Hackathon](https://www.kaggle.com/competitions/google-gemma-3n-hackathon).

### Challenge overview

Your mission is to leverage the unique capabilities of Gemma 3n to create a product that addresses a significant real-world challenge. Think bigger than a simple chatbot. How can a private, offline-first, multimodal model make a tangible difference in people's lives?

### Challenge details

#### Description

Hello World! The future of AI is personal, private, and compact enough to run in the palm of your hand. With the launch of Gemma 3n, we are putting the next generation of on-device, multimodal AI into your hands. Now, we challenge you to use this groundbreaking technology to build products that create meaningful, positive change in the world.

This is your opportunity to tackle real-world problems in areas like accessibility, education, healthcare, environmental sustainability, and crisis response. With a total prize pool of $150,000, we're looking for projects that aren't just technically brilliant, but are truly built for impact.

Gemma 3n is Google's first open model built on a new, cutting-edge architecture designed for mobile-first AI. It allows for highly capable, real-time AI to operate directly on phones, tablets, and laptops, enabling experiences that are both personal and private.

#### What is Gemma 3n?

##### Here’s what makes Gemma 3n a game-changer for developers:

* Optimized On-Device Performance: Gemma 3n is engineered for speed and efficiency. Thanks to innovations like Per-Layer Embeddings (PLE), the 5B and 8B parameter models run with a memory footprint comparable to 2B and 4B models, making them perfect for resource-constrained devices.
* Many-in-1 Flexibility: A single 4B model natively includes a 2B submodel, allowing you to dynamically trade off performance and quality on the fly. You can even use the "mix’n’match" capability to create custom-sized submodels for your specific use case.
* Privacy-First & Offline Ready: By running locally, Gemma 3n enables applications that protect user privacy and function reliably, even without an internet connection—a critical feature for accessibility and use in remote areas.
* Expanded Multimodal Understanding: Gemma 3n understands and processes interleaved audio, text, and images, with significantly enhanced video understanding. This unlocks powerful capabilities like real-time transcription, translation, and rich, voice-driven interactions.
* Improved Multilingual Capabilities: The model features strong performance across multiple languages, including Japanese, German, Korean, Spanish, and French, breaking down communication barriers.

#### The Challenge: Your Mission to Build for Impact

Your mission is to leverage the unique capabilities of Gemma 3n to create a product that addresses a significant real-world challenge. Think bigger than a simple chatbot. How can a private, offline-first, multimodal model make a tangible difference in people's lives?
