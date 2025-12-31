# EmergentRPG

Emergent RPG is an experimental, low-poly, open-world RPG built in Unity, inspired by games like Skyrim, Dwarf Fortress, RimWorld, Valheim, and Factorio.
The goal is to create a rich, weighty world where story emerges from systems, not scripts—while still supporting meaningful long-term narrative arcs.

This project is early and intentionally exploratory.

## Vision

We’re exploring how emergent gameplay can drive story, politics, and world evolution in an RPG context.

At a high level:
- The world is systemic and reactive
- NPCs are autonomous agents with values, traits, and goals
- Cities, factions, and politics evolve organically over time
- The player can move between different levels of abstraction (adventurer → leader → ruler)
- Death is not failure—your legacy persists

## Core Design Pillars

### Emergence Through Systems

Story arises from interactions between:
- NPC ↔ NPC
- NPC ↔ Player
- NPC ↔ Environment
- Environment ↔ Player
- Systems acting on themselves over time

NPCs have:
- Values
- Interests
- Skills/Stats
- Traits
- Statuses

These influence behavior, dialogue, relationships, and long-term outcomes.

### World Guidance (Not Pure Randomness)

Pure randomness often feels hollow.
We aim to balance emergence with structure, likely via:
- A high-level “world AI” or gamemaster system
- Long-term narrative pressures or main quest arcs
- Event systems that nudge the world rather than dictate outcomes

### Progression Across Scales

Inspired by Spore and D&D:
- Seamlessly move between personal, local, and global gameplay
- Play as an adventurer, then a leader, then a ruler
- Advancement may require social buy-in (elections, reputation, fear, ideology)

### Legacy & Continuity

- Death may transition control to a descendant (roguelite elements)
- The world remembers your actions
- Factions, cities, and conflicts persist beyond a single character

## Inspirations

- **Skyrim** – Open world, factions, reputation, story depth
- **Valheim** – Building, survival, combat feel, terrain interaction
- **RimWorld** – Emergent NPC dynamics, world AI events, colony management
- **Factorio** – Systems thinking, resource flow, automation (selectively)
- **D&D** – Skill checks, power scaling, character expression
- *Inspirational Links*
    - [Story Generators reddit post](https://www.reddit.com/r/gamedesign/comments/1o312ry/story_generators_the_final_frontier_of_game_design/)

## Repository Structure
``` text
/
├── Assets/              # Unity assets and game content
├── Specs/               # Design specs, system docs, experiments
├── tasks.md             # Active and planned work items
├── CONTRIBUTING.md      # Contribution guidelines
└── README.md
```


