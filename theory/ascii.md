# UDCDM ASCII Diagram Archive

**Document:** Urban Data Communication Decision Model (UDCDM)  
**Version:** 2.0 — January 2026  
**Purpose:** Archive of original ASCII illustrations replaced by generated figures

---

## Figure 1: The Four Dimensions of Urban Data (Original ASCII)

**Replaced by:** `Figure_1_Dimensions.mmd` (Mermaid mindmap)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    THE FOUR DIMENSIONS OF URBAN DATA                        │
│                                                                             │
│         ┌─────────────────┐                    ┌─────────────────┐          │
│         │                 │                    │                 │          │
│         │   VISIBILITY    │                    │   DYNAMISM      │          │
│         │                 │                    │                 │          │
│         │  Is this data   │                    │  Does this data │          │
│         │  about something│                    │  change over    │          │
│         │  you can see    │                    │  time?          │          │
│         │  in real life?  │                    │                 │          │
│         │                 │                    │                 │          │
│         └────────┬────────┘                    └────────┬────────┘          │
│                  │                                      │                   │
│                  │         ┌──────────────┐             │                   │
│                  └─────────┤  URBAN DATA  ├─────────────┘                   │
│                            └──────┬───────┘                                 │
│                  ┌───────────────┴───────────────┐                         │
│                  │                                │                         │
│         ┌────────┴────────┐              ┌───────┴────────┐                │
│         │                 │              │                │                │
│         │   AGENCY        │              │   ABSTRACTION  │                │
│         │                 │              │                │                │
│         │  Can the user   │              │  How processed │                │
│         │  affect or      │              │  is this data  │                │
│         │  explore this?  │              │  from raw      │                │
│         │                 │              │  observation?  │                │
│         │                 │              │                │                │
│         └─────────────────┘              └────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Figure 2: The Decision Tree with Step 0 CEE Gatekeeper (Original ASCII)

**Replaced by:** `Figure_2_DecisionTree.mmd` (Mermaid flowchart)

```
                                START
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │ STEP 0: CEE CHECK           │
                    │ Is Information Complexity   │
                    │ > Modality-Load Threshold?  │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
               ┌────────┐                  ┌────────┐
               │  NO    │                  │  YES   │
               └────┬───┘                  └────┬───┘
                    │                           │
                    ▼                           │
    ┌───────────────────────────┐               │
    │ STOP — SIMPLER MODALITY   │               │
    │                           │               │
    │ IC ≤ β: Use flat screen,  │               │
    │ static map, or paper.     │               │
    │                           │               │
    │ MR cognitively inefficient│               │
    │ for this IC. Proceed only │               │
    │ if collaboration demands. │               │
    └───────────────────────────┘               │
                                                │
                    ┌───────────────────────────┘
                    │
                    ▼
                    ┌─────────────────────────────┐
                    │  Is this data VISIBLE       │
                    │  in the real world?         │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
               ┌────────┐                  ┌────────┐
               │VISIBLE │                  │INVISIBLE│
               └────┬───┘                  └────┬───┘
                    │                           │
                    ▼                           ▼
    ┌───────────────────────────┐  ┌───────────────────────────┐
    │ DESIGN GOAL:              │  │ DESIGN GOAL:              │
    │ Enhancement & Context     │  │ Revelation & Explanation  │
    │                           │  │                           │
    │ • Can use realistic       │  │ • Must invent visual      │
    │   representation          │  │   language                │
    │ • Audio can be literal    │  │ • Audio can EMBODY the    │
    │   (ambient city sounds)   │  │   invisible (wind sound)  │
    │ • Lower explanation need  │  │ • Higher explanation need │
    └───────────────┬───────────┘  └───────────────┬───────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Is this data DYNAMIC?      │
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
         ┌────────┐          ┌────────┐          ┌────────┐
         │STATIC  │          │PARAMETRIC│        │DYNAMIC │
         └────┬───┘          └────┬───┘          └────┬───┘
              │                   │                   │
              ▼                   ▼                   ▼
┌─────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────┐
│ TEMPORAL DESIGN:    │ │ TEMPORAL DESIGN:        │ │ TEMPORAL DESIGN:    │
│ Reference Layer     │ │ Time Control            │ │ Animation           │
│                     │ │                         │ │                     │
│ • Show once, stable │ │ • Provide slider/       │ │ • Continuous motion │
│ • Base map/context  │ │   dial control          │ │ • Particle systems  │
│ • Toggle on/off     │ │ • Show state at         │ │ • Agent movement    │
│ • No animation      │ │   selected time         │ │ • Requires attention│
│                     │ │ • Before/after          │ │   OR ambient BG     │
│                     │ │   comparison            │ │                     │
└─────────────────────┘ └─────────────────────────┘ └─────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  What AGENCY does user have?│
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
         ┌────────┐          ┌────────┐          ┌────────┐
         │OBSERVE │          │EXPLORE │          │MANIPULATE│
         └────┬───┘          └────┬───┘          └────┬───┘
              │                   │                   │
              ▼                   ▼                   ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ INTERACTION DESIGN: │ │ INTERACTION DESIGN: │ │ INTERACTION DESIGN: │
│ Ambient Display     │ │ Cursor/Touch Query  │ │ Parameter Controls  │
│                     │ │                     │ │                     │
│ • No input needed   │ │ • Position = query  │ │ • Sliders, dials    │
│ • Peripheral viewing│ │ • Hover reveals     │ │ • Tangible objects  │
│ • Can layer with    │ │ • Path creates      │ │ • What-if scenarios │
│   other modes       │ │   exploration trace │ │ • Requires learning │
│ • Good for public   │ │ • Embodied (cursor  │ │ • Best for experts  │
│   settings          │ │   = body)           │ │                     │
│                     │ │ • Good for all      │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  How ABSTRACT is the data?  │
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
         ┌────────┐          ┌────────┐          ┌────────┐
         │CONCRETE│          │PROCESSED│         │DERIVED │
         └────┬───┘          └────┬───┘          └────┬───┘
              │                   │                   │
              ▼                   ▼                   ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ REPRESENTATION:     │ │ REPRESENTATION:     │ │ REPRESENTATION:     │
│ Iconic/Literal      │ │ Symbolic/Encoded    │ │ Abstract/Numeric    │
│                     │ │                     │ │                     │
│ • Looks like the    │ │ • Visual metaphor   │ │ • Numbers, charts   │
│   thing it represents│ │   (particles=wind) │ │ • Colour scales with│
│ • Minimal legend    │ │ • Needs legend      │ │   legend essential  │
│ • Audio can be      │ │ • Audio can encode  │ │ • Audio for alerts  │
│   literal (birds)   │ │   (pitch=speed)     │ │   or thresholds     │
│ • Self-explanatory  │ │ • Some explanation  │ │ • Requires training │
│                     │ │   needed            │ │ • Expert audience   │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

## Figure 3: Sensory Channel Selection Matrix (Original ASCII)

**Status:** Retained in main document (informational diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SENSORY CHANNEL SELECTION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              VISIBILITY                                     │
│                      VISIBLE          INVISIBLE                             │
│                         │                 │                                 │
│              ┌──────────┴──────────┬──────┴───────────┐                    │
│              │                     │                  │                    │
│              ▼                     ▼                  ▼                    │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                        VISUAL                               │          │
│   ├─────────────────────────────────────────────────────────────┤          │
│   │ VISIBLE data:              │ INVISIBLE data:                │          │
│   │ • Realistic icons          │ • Abstract encoding            │          │
│   │ • Familiar shapes          │ • Particles, fields, gradients │          │
│   │ • Photos/textures          │ • Invented visual language     │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                        AUDIO                                │          │
│   ├─────────────────────────────────────────────────────────────┤          │
│   │ VISIBLE data:              │ INVISIBLE data:                │          │
│   │ • Literal sounds           │ • SONIFICATION opportunity     │          │
│   │   (traffic, birds)         │ • Audio embodies the force     │          │
│   │ • Reinforces visual        │ • Primary information channel  │          │
│   │ • Atmospheric/ambient      │ • Wind→whoosh, flow→water      │          │
│   │                            │ • Pitch/volume = magnitude     │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                        HAPTIC                               │          │
│   ├─────────────────────────────────────────────────────────────┤          │
│   │ Best for:                                                   │          │
│   │ • Alerts and thresholds (vibration when crossing boundary)  │          │
│   │ • Confirming actions (tactile feedback on input)            │          │
│   │ • Invisible forces at body (wind force on tangible object)  │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Figure 4: The Critical Insight — Audio for the Invisible (Original ASCII)

**Status:** Retained in main document (callout box)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   KEY DESIGN PRINCIPLE:                                                     │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                                                                   │    │
│   │   INVISIBLE + DYNAMIC data is the HIGHEST VALUE use case for     │    │
│   │   SONIFICATION                                                    │    │
│   │                                                                   │    │
│   │   Because:                                                        │    │
│   │   • You can't see it in real life → needs revelation              │    │
│   │   • It changes continuously → audio tracks change naturally       │    │
│   │   • Visual system already encoding spatial pattern               │    │
│   │   • Audio can encode magnitude/intensity without visual clutter   │    │
│   │                                                                   │    │
│   │   Examples:                                                       │    │
│   │   • Wind velocity → wind sound intensity/pitch                    │    │
│   │   • Green view factor → nature/city sound blend                   │    │
│   │   • Noise pollution → actual noise playback                       │    │
│   │                                                                   │    │
│   └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Figure 5: The Embodiment Spectrum (Original ASCII)

**Status:** Retained in main document (spectrum diagram)

```
DISEMBODIED                                              EMBODIED
(Bird's-eye view)                                    (First-person)
     │                                                      │
     ├── CFD (observe wind field)                           │
     ├── Stormwater (observe flow)                          │
     ├── Sun Study (observe shadows)                        │
     │                                                      │
     │              ├── Street Life (watch agents)          │
     │              ├── Bird Sounds (proximity)             │
     │                                                      │
     │                              ├── Isovist ────────────┤
     │                              │   (cursor = body,     │
     │                              │    gaze = direction,  │
     │                              │    hearing = GVF)     │
     └────────────────────────────────────────────────────────┘
```

---

## Figure 6: The Cognitive Efficiency Envelope (Original ASCII)

**Replaced by:** `Figure_6_CEE.png` / `Figure_6_CEE.pdf` (matplotlib)

```
                           COGNITIVE EFFICIENCY ENVELOPE
    
    Total                                                                    
    Cognitive    │                                                           
    Load         │                     ╱ 2D Web Map                          
                 │                   ╱   (fails at high                      
                 │                 ╱      complexity)                        
                 │               ╱                                           
                 │             ╱        ╭───────── MR Projection Table       
                 │           ╱        ╱             (supports ecological     
                 │         ╱       ╱                perception of 3D data)   
                 │       ╱      ╱                                            
                 │     ╱     ╱                                               
                 │   ╱    ╱    ← Threshold β (MR becomes efficient)          
                 │ ╱   ╱                                                     
    MR Entry ────│╱──╱─────────────────────────────────────────────────────  
    Cost (IO)    │ ╱                                                          
                 │╱                                                           
    2D Entry ────│─────────────────────────────────────────────────────────  
    Cost         │                                                           
                 │    ↑                           ↑                          
                 │  ZONE A                     ZONE B                        
                 │  (2D Optimal)               (MR Optimal)                  
                 │                                                           
                 └────────────────────────────────────────────────────────→  
                           Information Complexity (IC)                       
                                                                             
    ┌─────────────────────────────────────────────────────────────────────┐  
    │  ZONE A: Low IC (e.g., bus positions)                               │  
    │  • 2D has low entry cost + low processing load = HIGH EFFICIENCY    │  
    │  • MR has high entry cost + low processing load = INEFFICIENT       │  
    │  → Using MR here constitutes sub-optimal modality selection         │  
    ├─────────────────────────────────────────────────────────────────────┤  
    │  ZONE B: High IC (e.g., 3D wind flow around buildings)              │  
    │  • 2D curve spikes—user mentally reconstructs 3D from 2D slices     │  
    │  • MR offloads load—walking replaces mental rotation                │  
    │  → MR reduces net cognitive load; modality is cognitively efficient │  
    └─────────────────────────────────────────────────────────────────────┘  

    Note: The Cognitive Efficiency Envelope represents the path of lowest   
    Total Cognitive Load to achieve a required level of insight for a given 
    data complexity. 'Efficiency' is achieved by minimising unnecessary     
    cognitive effort (cognitive waste) for a given informational outcome.   
```

---

## CEE Economic Model Box (Original ASCII)

**Status:** Retained in main document (economic summary)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE CEE ECONOMIC MODEL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   COST    =  Interaction Overhead (IO)  +  Mental Reconstruction Effort    │
│              ─────────────────────────     ────────────────────────────    │
│              (baseline extraneous load)    (intrinsic load not supported   │
│                                            by the modality)                │
│                                                                             │
│   BENEFIT =  Insight Achieved                                               │
│                                                                             │
│   EFFICIENCY = Benefit / Cost                                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   2D MODALITY:     Low IO  +  High reconstruction (for 3D data)  =  ↓ Eff  │
│   MR MODALITY:     High IO +  Low reconstruction (for 3D data)   =  ↑ Eff  │
│                                                                             │
│   DECISION RULE:   Choose the modality that MINIMISES Total Cost           │
│                    for the REQUIRED Insight.                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Pre-Flight Checklist (Original ASCII)

**Status:** Retained in main document (checklist format)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MODALITY SELECTION PRE-FLIGHT CHECKLIST                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 0a: COUNT DIMENSIONS OF ENCODING                                      │
│  ─────────────────────────────────────                                      │
│  How many variables are being visualised?                                   │
│  (e.g., X, Y, Time, Speed, ID, Category = 6 dimensions)                     │
│                                                                             │
│  STEP 0b: ASSESS SPATIAL STRUCTURE                                          │
│  ─────────────────────────────────                                          │
│  Is the data inherently:                                                    │
│  □ 2D (points/lines on a plane) → 2D modality likely sufficient            │
│  □ 2.5D (extruded footprints, terrain) → MR may add value                  │
│  □ 3D (volumetric, multi-level) → MR strongly indicated                    │
│                                                                             │
│  STEP 0c: IDENTIFY CRITICAL INSIGHT TYPE                                    │
│  ──────────────────────────────────────                                     │
│  What must the user understand?                                             │
│  □ Numeric patterns, trends → 2D chart/dashboard                           │
│  □ Spatial distribution → 2D map may suffice                               │
│  □ 3D spatial relationships → MR appropriate                               │
│  □ Experiential qualities → Immersive VR appropriate                       │
│                                                                             │
│  STEP 0d: CALCULATE SPATIAL INFORMATION GAIN                                │
│  ───────────────────────────────────────────                                │
│  Is the Spatial Interaction Cost (walking, head movement) less than        │
│  the Spatial Information Gain?                                              │
│  □ Yes → Proceed to UDCDM Design Framework                                 │
│  □ No → Use lower-fidelity modality (2D map, dashboard)                    │
│                                                                             │
│  WARNING: "Doing 3D work for 2D reward" = Cognitive Inefficiency           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix C: Quick Reference Card (Original ASCII)

**Status:** Retained in main document (reference card format)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│         URBAN DATA COMMUNICATION DECISION MODEL (UDCDM)                     │
│                      Quick Reference Card                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 0: CEE PRE-FLIGHT CHECK (Do this first!)                              │
│  ─────────────────────────────────────────────                              │
│                                                                             │
│  □ Is Information Complexity > Modality-Load Threshold (β)?                 │
│    • Is data 3D/volumetric OR temporally dynamic OR multi-variate?          │
│    • Does the task require spatial collaboration around a shared view?      │
│    • Does embodied navigation add value (walking around = insight)?         │
│                                                                             │
│    IF NO to all → Use simpler modality (screen, paper, web map)             │
│    IF YES to any → Proceed to Step 1                                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: CLASSIFY YOUR DATA                                                 │
│  ────────────────────────────                                               │
│                                                                             │
│  □ VISIBILITY:   ○ Visible    ○ Invisible                                   │
│  □ DYNAMISM:     ○ Static     ○ Parametric    ○ Dynamic                     │
│  □ AGENCY:       ○ Observe    ○ Explore       ○ Manipulate                  │
│  □ ABSTRACTION:  ○ Concrete   ○ Processed     ○ Derived                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 2: DETERMINE VISUAL APPROACH                                          │
│  ──────────────────────────────────                                         │
│                                                                             │
│  IF Visible + Concrete    → Iconic/realistic representation                 │
│  IF Invisible + Processed → Particle systems, gradients, fields             │
│  IF Derived               → Charts, numbers, colour scales + legend         │
│                                                                             │
│  IF Dynamic               → Animation (continuous or looped)                │
│  IF Parametric            → Show current state, provide time control        │
│  IF Static                → Reference layer, toggle on/off                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 3: DETERMINE AUDIO APPROACH                                           │
│  ──────────────────────────────────                                         │
│                                                                             │
│  HIGH VALUE (do this):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Invisible + Dynamic → SONIFY the phenomenon                         │   │
│  │   • Wind velocity → wind sound pitch/volume                         │   │
│  │   • Visibility/greenness → nature/city blend                        │   │
│  │   • Water flow → water sound intensity                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  MEDIUM VALUE (optional):                                                   │
│  • Visible + Dynamic → Literal ambient sounds (city, traffic, birds)        │
│  • Parametric → Time-of-day soundscape variation                            │
│                                                                             │
│  LOW VALUE (skip or minimal):                                               │
│  • Static + Concrete → No audio needed                                      │
│  • Derived metrics → Earcons for thresholds only                            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 4: DETERMINE INTERACTION APPROACH                                     │
│  ────────────────────────────────────────                                   │
│                                                                             │
│  OBSERVE  → Ambient display, no input required                              │
│           → Good for: public settings, background layer                     │
│                                                                             │
│  EXPLORE  → Cursor/touch position = query point                             │
│           → Consider: embodied mode (cursor = body)                         │
│           → Good for: engagement, discovery                                 │
│                                                                             │
│  MANIPULATE → Provide controls (sliders, tangibles, voice)                  │
│            → Consider: presets for non-experts                              │
│            → Good for: analysis, design iteration                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Archive created: January 2026*  
*Purpose: Preservation of original ASCII artwork for version control and fallback rendering*
