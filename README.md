# That-life
That Life turns personal context into focused action — building a goal-specific workspace, surfacing what's missing, and adapting the focus session as you work.
> Turn what you already know into focused action.

## The idea

Knowing what to do isn't always the problem. The problem is turning scattered
personal context into a focused session where you can actually get the thing done.

That Life builds a goal-specific workspace from the user's own notes and goal.
It surfaces relevant information, identifies gaps, creates an actionable plan,
and adapts the session when the user gets distracted or falls behind.

## What it does

- 🎯 Turns a goal into a dedicated workspace
- 📄 Uses the user's saved notes as personal context
- 🔎 Surfaces relevant information and missing items
- ⏱️ Creates a focused time-bound session
- 🔒 Reacts to distraction with a focus sprint
- 🔄 Adapts when the user is running late or falls behind
- 💳 Uses RevenueCat for the Pro entitlement

## Why it's helpful
We often already know what we need to do. The harder part is turning everything we already have — our notes, plans, information, and unfinished tasks — into a clear moment of action. That Life helps bridge that gap.

You give it a goal, and it creates a workspace around that goal. It brings relevant information from your saved notes into context, surfaces things that may still be missing, turns the goal into a practical plan, and gives you a focused session to work through it.

And the workspace doesn't have to stay static. If you get distracted, fall behind, or run out of time, That Life can adapt the session instead of simply letting the timer keep running.

The idea is simple: Don't just tell me what I should do. Help me get started, stay focused, and move it forward.

## Demo

The demo shows three different goals:
1. Studying
2. Preparing for a job interview
3. Applying for a scholarship

The same workspace concept adapts to each person's goal and context.

## Current prototype

This is an early working prototype. Notes are currently added by the user
inside the app and analyzed on-device using the app's local intent and
keyword-based context engine.

No notes are uploaded to a server.

## Run locally

```bash
npm install
npx expo start
