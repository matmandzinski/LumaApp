# SimpleFlashcards — UI/UX Structure (Main Navigation & Dashboard)

## General UI Philosophy

The application should feel:

* calm,
* modern,
* lightweight,
* premium,
* distraction-free.

The UI should prioritize:

* extremely fast access to learning,
* low cognitive load,
* habit-building,
* one-handed mobile usage.

The interface should avoid:

* clutter,
* excessive gamification,
* too many icons,
* complicated menus,
* enterprise-like layouts.

The design should feel closer to:

* Headspace,
* modern Notion mobile,
* minimalist productivity apps,
  than to traditional educational platforms.

---

# Navigation Structure

The app should use a very simple mobile navigation system.

Recommended:

## Bottom Navigation Bar (4 tabs)

Tabs:

1. Home
2. My Sets
3. Statistics
4. Settings

The navigation bar should:

* stay visible across most screens,
* use simple outline icons,
* have soft animations,
* use minimal labels.

The “Home” tab should be the main entry point of the app.

---

# 1. HOME SCREEN (Dashboard)

## Purpose

The dashboard is the emotional center of the app.

It should answer:

* What should I learn now?
* Is my quick lesson done?
* What is my active set?
* How fast can I start learning?

The screen should feel:

* motivating,
* clean,
* calm,
* effortless.

---

# HOME SCREEN LAYOUT

## Top Area

### Greeting Section

At the very top:

* short greeting,
* current streak or progress.

Example:

```text
Good evening 👋
Ready for today’s quick lesson?
```

Small, subtle, not gamified.

---

## Active Set Card

Large rounded card.

Contains:

* active set name,
* number of flashcards,
* optional small progress info.

Example:

```text
English for IT
124 cards
```

Visual:

* soft shadow,
* premium card,
* subtle accent color,
* possibly a small “Active” badge.

Tap action:
→ opens set details.

---

# MAIN FEATURE AREA

## Quick Lesson Card (Most Important Component)

This should be the visually dominant element.

Large card/button in the center of the screen.

States:

### State 1 — Ready

Shows:

* “Quick lesson ready”
* “5 cards • 1–2 min”

CTA:

```text
Start Quick Lesson
```

Visual:

* inviting,
* slightly highlighted,
* soft gradient/accent.

---

### State 2 — Completed

Shows:

* checkmark,
* “Quick lesson completed”

Secondary CTA:

```text
Continue learning
```

Visual:

* calmer,
* softer colors,
* subtle success feedback.

---

# Continue Learning Section

Below quick lesson.

Medium-sized button/card.

Purpose:

* resume longer learning session.

Should feel secondary compared to Quick Lesson.

---

# SECONDARY ACTIONS SECTION

Grid or vertical list of cards/buttons.

## My Sets

Opens:
→ user-created flashcard sets.

Visual:

* clean tile,
* small icon,
* optional active set badge.

---

## Ready-made Sets

Opens:
→ curated sets provided by app.

Should visually suggest exploration/content discovery.

---

## Statistics

Opens:
→ progress overview.

Should feel lightweight, not analytical-heavy.

---

## Settings

Opens:
→ app settings.

Low visual priority.

---

# Bottom Navigation

Minimal iOS-style navigation bar.

Tabs:

* Home
* Sets
* Stats
* Settings

Should:

* use soft icons,
* avoid strong borders,
* have smooth selected-state animations.

---

# HOME SCREEN UX FLOW

The expected user flow:

```text
Open app
→ see active set
→ see quick lesson status
→ start learning in 1 tap
→ finish quick lesson
→ return to dashboard
```

The app should always make the next action obvious.

---

# Interaction Design

## Buttons

* large,
* rounded,
* easy to tap,
* strong hierarchy.

Primary CTA:

* filled button.

Secondary CTA:

* outline or lighter card.

---

## Cards

Cards are core design element.

Every important object should be represented as a card:

* flashcard sets,
* quick lesson,
* statistics,
* progress.

Cards should:

* have rounded corners,
* subtle shadows,
* lots of padding,
* soft transitions.

---

# Typography

Typography should feel:

* modern,
* calm,
* readable.

Use:

* large titles,
* medium subtitles,
* soft gray secondary text.

Avoid:

* dense text blocks,
* overly small labels.

---

# Colors

Recommended palette:

* off-white background,
* white cards,
* charcoal text,
* muted blue or green accent.

Avoid:

* bright saturated colors,
* harsh reds,
* heavy gradients.

---

# Animation Philosophy

Animations should be:

* subtle,
* smooth,
* premium feeling.

Examples:

* card fade,
* soft slide transition,
* gentle button press animation.

Avoid:

* bouncing,
* excessive gamification,
* noisy transitions.

---

# Important UX Principle

The app should always feel:

```text
“Easy to return to.”
```

The user should never feel:

* overwhelmed,
* pressured,
* behind,
* forced to “grind”.

The UI should encourage:

* tiny learning sessions,
* repeated daily usage,
* low-friction interaction.

---

# Key Product Feeling

The product should feel like:

```text
“A calm daily learning companion.”
```

Not:

```text
“A productivity machine.”
```
