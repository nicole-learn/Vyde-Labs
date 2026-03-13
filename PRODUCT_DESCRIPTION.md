# TryPlayground Product Description

## Overview

TryPlayground is a Fal-powered AI creation studio built around one idea:

AI tools should feel usable, organized, and consistent the moment you open them.

Instead of splitting text, image, video, speech, and utility creation across disconnected tools, TryPlayground brings them into a single workspace with one shared interface. You choose a model, enter a prompt, add references when needed, run the generation, and keep what you create organized in folders.

TryPlayground is available in two forms:

- an open-source local version for people who want to run everything on their own machine with their own Fal API key
- a hosted version for people who want a managed experience with simple credit-based billing

Both versions are built around the same studio experience. The difference is how access, billing, and key management work.

## The Core Experience

At its heart, TryPlayground is a focused AI studio.

The product is designed around a few core actions:

- choosing a model
- writing or refining a prompt
- uploading references when a model supports them
- generating text, images, video, speech, or utility outputs like transparent cutouts
- reviewing previous runs
- organizing outputs into folders

The experience is intentionally direct. TryPlayground is not a workflow builder and it is not trying to turn simple generation into a multi-step automation diagram. The point is to reduce friction between an idea and an output.

When a user opens TryPlayground, they enter a single workspace. From there, everything important is visible:

- the model they are working with
- the controls relevant to that model
- their recent runs
- the outputs they want to keep
- the folders that organize the work

This is what makes the product feel clean. The studio is designed to stay centered on creation, not on setup overhead.

## Text, Image, Video, Speech, and Utility In One Place

TryPlayground supports five core types of creation:

- LLM-based text generation
- image generation
- video generation
- text-to-speech generation
- background removal for transparent image cutouts

All of them live inside the same studio instead of being treated like separate products.

For users, that means the mental model stays the same:

- pick what you want to make
- choose the model that fits the job
- enter your instructions
- generate
- save and organize what matters

This consistency matters more than it sounds. Many AI tools force users to relearn the interface every time they switch tasks. TryPlayground is designed so the product feels familiar whether you are asking for text, creating still images, generating motion, voicing a script, or cleaning up an image for compositing.

## Why Folders Are A Core Feature

Folders are one of the most important parts of TryPlayground.

People do not create just one output. They generate variations, references, drafts, alternates, and final picks. Without organization, even a great model interface becomes unusable after enough activity.

TryPlayground treats folders as part of the core product, not as a secondary storage feature.

Folders make it possible to:

- organize outputs by project, campaign, or client
- keep different creative directions separate
- collect variations from the same prompt or concept
- save references and results side by side
- build a workspace that stays readable over time

This is especially important for users who generate often. A good AI tool should not only help users create. It should help them keep creating without turning their library into chaos.

## Open Source / Local TryPlayground

The open-source version of TryPlayground is designed for users who want full control.

This version runs locally on a user's own machine. The user brings their own Fal API key, enters it through the in-app provider settings screen, and uses the same studio interface without needing a cloud deployment or managed account.

### How the local version works

In the local version:

- the user installs and runs TryPlayground on their own computer
- the user enters their Fal API key inside the app
- the key stays only for the current app session unless the user chooses a more persistent setup later
- generations are made using the user's own Fal account
- files, history, and folders stay local
- there is no billing layer inside TryPlayground itself

This makes the local version ideal for users who want privacy, direct provider billing, or a self-run setup.

### What the local version feels like

The local version is meant to feel immediate.

A user should be able to:

1. launch the app
2. open provider settings
3. paste in a Fal key
4. start generating

There should be no need to provision cloud infrastructure, create database tables, or configure third-party deployment services just to use the product.

### Who the local version is for

The local version is a strong fit for:

- creators who want direct control
- developers who want to inspect or adapt the product
- users who prefer local-first tools
- people who want to pay Fal directly under their own account

## Hosted TryPlayground

The hosted version is designed for users who want the same product with less setup.

In the hosted version, TryPlayground manages the provider key and infrastructure. A user signs in, buys credits, and starts creating immediately. The UI remains the same studio experience, with one important addition: a profile button in the top-right corner that provides access to account information, credits, and billing.

### How the hosted version works

In the hosted version:

- users sign in to a TryPlayground account
- TryPlayground manages the Fal integration behind the scenes
- users do not provide their own API key
- generations are billed through credits
- outputs, history, and folders live in the user's hosted workspace

This keeps the hosted version simple. Users get the benefit of the same creative interface without needing to think about provider credentials.

### Hosted billing

Hosted billing is intentionally straightforward.

The model is:

- no subscriptions
- no monthly plan logic
- no usage bundles tied to account tiers
- credits sold in packs of 100 only

Hosted pricing is based on Fal market cost with a 25% platform markup.

That means users can understand the hosted experience in plain terms:

- buy credits
- use the studio
- spend credits as you generate

The goal is to keep the pricing model predictable instead of mixing subscriptions, provider bills, and multiple pricing systems.

## Queue Limits And Fairness

TryPlayground keeps queueing simple and predictable in both the local and hosted versions.

The rule is:

- each user can have up to 100 active queued or generating items at one time
- this 100-item cap applies in both local and hosted mode
- if a user tries to submit another generation after reaching that cap, TryPlayground shows a simple popup that says:

`limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing.`

Queued items can be canceled from the UI. Items that have already started generating cannot be canceled from the UI.

The hosted version is designed to share available generation capacity fairly across active users:

- if only one user is active, they can use the full available provider capacity
- if multiple users are active at the same time, available generation slots are shared evenly between them
- if there are more active users than available slots, the slots rotate fairly so users continue taking turns instead of one user monopolizing capacity

The local version uses the same 100-item cap, but with a simpler local queue controller because it only has to manage one user's machine at a time.

### Why some users will prefer hosted

The hosted version is best for users who want:

- the fastest possible onboarding
- a managed account instead of self-supplied API keys
- simple credit-based billing
- the same interface without local setup responsibilities

## LLMs As A Core Offering

LLMs are not an optional extra inside TryPlayground. They are part of the core product.

That matters because many creative workflows begin with language:

- brainstorming directions
- rewriting ideas
- generating scripts
- refining prompt language
- developing creative briefs

In TryPlayground, LLM access belongs in the same space as image, video, speech, and utility generation. Users should not have to leave the product to move from language to visuals, from visuals to speech, or from cleanup tools back to language.

For users, the important thing is simple:

- text, image, video, speech, and utility models live together
- the interface stays consistent
- the workspace stays organized in one place

## What Makes TryPlayground Different

TryPlayground is not trying to compete by being the most complicated AI platform.

Its value comes from restraint.

The product is defined by:

- one workspace
- one shared studio
- a folder-first organization system
- a Fal-powered model layer
- a clean split between local and hosted use

The product does not ask users to learn a workflow language before they can get value from it. It does not bury the creative experience under automation concepts. It keeps the center of gravity on generation, iteration, and organization.

## Local Vs Hosted At A Glance

### Open Source / Local

- you run it yourself
- you add your own Fal API key
- you pay Fal directly
- your files, folders, and history stay local
- no hosted billing layer

### Hosted

- TryPlayground manages the provider access
- you sign in with a TryPlayground account
- you buy 100-credit packs
- usage is charged at Fal market cost plus 25%
- your workspace is managed for you

## The User Promise

TryPlayground should feel simple from the first session and stay usable after the hundredth.

That means:

- fast access to strong models
- one consistent interface
- folders that actually matter
- no unnecessary workflow complexity
- a clear choice between local control and hosted convenience

In practical terms, TryPlayground is a product for people who want to make things with AI and keep their work organized without fighting the tool itself.
