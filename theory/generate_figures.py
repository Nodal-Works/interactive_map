#!/usr/bin/env python3
"""
UDCDM Figure Generator
======================
Generates publication-quality figures for the Urban Data Communication Decision Model.

Outputs:
    - Figure_6_CEE.png: The Cognitive Efficiency Envelope (matplotlib)
    - Figure_1_Dimensions.mmd: Four Dimensions mindmap (Mermaid)
    - Figure_2_DecisionTree.mmd: Decision Tree flowchart (Mermaid)

Requirements:
    pip install matplotlib numpy

Usage:
    python generate_figures.py

Date: January 2026
"""

import matplotlib.pyplot as plt
import numpy as np
import os

# ============================================================================
# FIGURE 6: THE COGNITIVE EFFICIENCY ENVELOPE (Matplotlib)
# ============================================================================

def plot_cognitive_efficiency_envelope(output_dir="."):
    """
    Generate a publication-quality plot of the Cognitive Efficiency Envelope.
    
    The plot visualizes the crossover point (Modality-Load Threshold β) where
    Mixed Reality becomes cognitively efficient compared to 2D modalities.
    """
    # 1. Setup the style
    plt.style.use('seaborn-v0_8-whitegrid')
    fig, ax = plt.subplots(figsize=(10, 6))

    # 2. Define the curves
    # x = Information Complexity (0 to 10)
    x = np.linspace(0, 10, 500)
    
    # Curve A: 2D Modality (Low entry cost, exponential processing load at high complexity)
    # Represents cognitive saturation as users mentally reconstruct 3D from 2D
    y_2d = 1.0 + 0.05 * np.exp(0.8 * x)
    
    # Curve B: MR Modality (High entry cost, linear/sublinear processing load)
    # Represents how MR offloads intrinsic load to perceptual systems
    y_mr = 5.0 + 0.3 * x

    # 3. Plot Curves
    ax.plot(x, y_2d, label='2D Modality (e.g., Web Map)', color='#2c3e50', linewidth=2.5)
    ax.plot(x, y_mr, label='Mixed Reality (e.g., Projection Table)', color='#8e44ad', linewidth=2.5, linestyle='--')

    # 4. Calculate Intersection (Threshold Beta)
    idx = np.argwhere(np.diff(np.sign(y_2d - y_mr))).flatten()
    if len(idx) > 0:
        x_cross = x[idx][0]
        y_cross = y_2d[idx][0]
    else:
        # Fallback if no intersection found
        x_cross = 5.5
        y_cross = 6.5

    # 5. Shade Zones
    # Zone A (2D Optimal) - light grey
    ax.fill_between(x, 0, 15, where=(x <= x_cross), color='#ecf0f1', alpha=0.5)
    ax.text(x_cross/2, 2, "ZONE A\n(2D Optimal)", ha='center', fontsize=12, fontweight='bold', color='#7f8c8d')
    
    # Zone B (MR Optimal) - light purple
    ax.fill_between(x, 0, 15, where=(x > x_cross), color='#f4ecf7', alpha=0.5)
    ax.text(x_cross + (10-x_cross)/2, 2, "ZONE B\n(MR Optimal)", ha='center', fontsize=12, fontweight='bold', color='#8e44ad')

    # 6. Annotations & Thresholds
    ax.plot(x_cross, y_cross, 'o', color='black', markersize=8)
    
    # Interaction Overhead Arrows
    ax.annotate('Low Interaction Overhead\n(Low Entry Cost)', xy=(0.2, 1.2), xytext=(1.5, 3.5),
                arrowprops=dict(facecolor='black', arrowstyle='->'), fontsize=9)
    
    ax.annotate('High Interaction Overhead\n(High Entry Cost)', xy=(0.2, 5.1), xytext=(1.5, 7),
                arrowprops=dict(facecolor='black', arrowstyle='->'), fontsize=9)

    # Threshold Beta Label
    ax.annotate(r'Modality-Load Threshold ($\beta$)', xy=(x_cross, y_cross), xytext=(x_cross+1, y_cross-1.5),
                arrowprops=dict(facecolor='black', shrink=0.05), fontsize=10, fontweight='bold')

    # Cognitive Inefficiency Region annotation
    ax.annotate('Cognitive Inefficiency\n(Sub-optimal modality)', xy=(1.5, 5.5), xytext=(0.5, 9),
                arrowprops=dict(facecolor='#c0392b', arrowstyle='->', connectionstyle="arc3,rad=.2"),
                fontsize=9, color='#c0392b', style='italic')

    # 7. Formatting
    ax.set_title('Figure 6: The Cognitive Efficiency Envelope', fontsize=14, fontweight='bold', pad=20)
    ax.set_xlabel('Information Complexity (IC)', fontsize=12)
    ax.set_ylabel('Total Cognitive Load (TCL)', fontsize=12)
    
    # Custom ticks
    ax.set_xticks([0, 10])
    ax.set_xticklabels(['Low\n(Simple Points)', 'High\n(Volumetric/Dynamic)'])
    ax.set_yticks([0, 15])
    ax.set_yticklabels(['Low', 'Saturation'])
    
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.legend(loc='upper center', frameon=True)
    
    # Remove top and right spines for academic look
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()
    
    # Save outputs
    png_path = os.path.join(output_dir, 'Figure_6_CEE.png')
    pdf_path = os.path.join(output_dir, 'Figure_6_CEE.pdf')
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight')
    plt.savefig(pdf_path, bbox_inches='tight')
    
    print(f"Generated: {png_path}")
    print(f"Generated: {pdf_path}")
    
    plt.close()


# ============================================================================
# FIGURE 1: THE FOUR DIMENSIONS (Mermaid Mindmap)
# ============================================================================

FIGURE_1_MERMAID = """%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#f4f4f4', 'primaryTextColor': '#333', 'primaryBorderColor': '#333'}}}%%
mindmap
  root((URBAN DATA))
    VISIBILITY
      [Is it visible in real life?]
      Visible: Enhancement
      Invisible: Revelation
    DYNAMISM
      [How does it change?]
      Static: Context Layer
      Parametric: Scenario Control
      Dynamic: Animation/Flow
    AGENCY
      [What can user do?]
      Observe: Watch
      Explore: Query/Navigate
      Manipulate: Control Parameters
    ABSTRACTION
      [Distance from reality]
      Concrete: Direct Representation
      Processed: Computed Patterns
      Derived: Metrics/Indices
"""


# ============================================================================
# FIGURE 2: THE DECISION TREE (Mermaid Flowchart)
# ============================================================================

FIGURE_2_MERMAID = """%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#fff', 'primaryTextColor': '#333', 'primaryBorderColor': '#333', 'lineColor': '#333'}}}%%
flowchart TD
    %% Styles
    classDef default fill:#fff,stroke:#333,stroke-width:1px
    classDef decision fill:#f9f9f9,stroke:#000,stroke-width:2px
    classDef stop fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef result fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef highlight fill:#f3e5f5,stroke:#8e44ad,stroke-width:2px

    Start((START)) --> Step0
    
    %% STEP 0: CEE GATEKEEPER
    Step0{{"STEP 0: CEE CHECK<br/>Is Information Complexity ><br/>Modality-Load Threshold β?"}}:::decision
    
    Step0 -- "No (IC ≤ β)" --> Stop1["STOP: Use Simpler Modality<br/>(2D Map / Dashboard / Paper)<br/><br/>MR cognitively inefficient<br/>for this data complexity"]:::stop
    Step0 -- "Yes (IC > β)" --> Step1
    
    %% STEP 1: VISIBILITY
    Step1{{"STEP 1: VISIBILITY<br/>Is the phenomenon visible<br/>to the naked eye?"}}:::decision
    
    Step1 -- Visible --> ResVis1["GOAL: Enhancement<br/>• Realistic representation<br/>• Literal audio (ambient)<br/>• Low explanation need"]:::result
    Step1 -- Invisible --> ResVis2["GOAL: Revelation<br/>• Invent visual language<br/>• Audio embodies force<br/>• Higher explanation need"]:::highlight
    
    ResVis1 --> Step2
    ResVis2 --> Step2
    
    %% STEP 2: DYNAMISM
    Step2{{"STEP 2: DYNAMISM<br/>Does it change over time?"}}:::decision
    
    Step2 -- Static --> ResDyn1["Reference Layer<br/>• No animation<br/>• Toggle on/off"]:::result
    Step2 -- Parametric --> ResDyn2["Scenario Layer<br/>• Time/parameter control<br/>• Before/after comparison"]:::result
    Step2 -- Dynamic --> ResDyn3["Flow/Simulation Layer<br/>• Continuous animation<br/>• Particle systems"]:::highlight
    
    ResDyn1 --> Step3
    ResDyn2 --> Step3
    ResDyn3 --> Step3
    
    %% SONIFICATION OPPORTUNITY
    ResVis2 -.->|"High-Value<br/>Sonification<br/>Opportunity"| ResDyn3
    ResDyn3 -.->|"SONIFY:<br/>Wind/Flow/Field"| AudioNode[["🔊 Audio Design:<br/>Ecological or Parametric<br/>Sonification"]]:::highlight

    %% STEP 3: AGENCY
    Step3{{"STEP 3: AGENCY<br/>What can the user do?"}}:::decision
    
    Step3 -- Observe --> ResAg1["Ambient Display<br/>• No input needed<br/>• Peripheral viewing"]:::result
    Step3 -- Explore --> ResAg2["Embodied Query<br/>• Cursor = body position<br/>• Hover reveals info"]:::result
    Step3 -- Manipulate --> ResAg3["Parameter Controls<br/>• Sliders/tangibles<br/>• What-if scenarios"]:::result
    
    ResAg1 --> Step4
    ResAg2 --> Step4
    ResAg3 --> Step4
    
    %% STEP 4: ABSTRACTION
    Step4{{"STEP 4: ABSTRACTION<br/>How processed is the data?"}}:::decision
    
    Step4 -- Concrete --> ResAbs1["Iconic Representation<br/>• Self-explanatory<br/>• Minimal legend"]:::result
    Step4 -- Processed --> ResAbs2["Symbolic Encoding<br/>• Visual metaphor<br/>• Legend required"]:::result
    Step4 -- Derived --> ResAbs3["Abstract Display<br/>• Numbers/charts<br/>• Full explanation needed"]:::result

    %% Link styling
    linkStyle 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20 stroke:#333,stroke-width:1px
"""


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def write_mermaid_file(filepath, content):
    """Write Mermaid diagram content to a .mmd file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content.strip())
    print(f"Generated: {filepath}")


def generate_all_figures(output_dir="."):
    """Generate all figures for the UDCDM paper."""
    
    print("=" * 60)
    print("UDCDM Figure Generator")
    print("=" * 60)
    print()
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate Figure 6 (matplotlib)
    print("[1/3] Generating Figure 6: Cognitive Efficiency Envelope...")
    try:
        plot_cognitive_efficiency_envelope(output_dir)
    except Exception as e:
        print(f"  Warning: Could not generate matplotlib figure: {e}")
        print("  (Ensure matplotlib and numpy are installed: pip install matplotlib numpy)")
    
    print()
    
    # Generate Figure 1 (Mermaid)
    print("[2/3] Generating Figure 1: Four Dimensions (Mermaid)...")
    write_mermaid_file(os.path.join(output_dir, "Figure_1_Dimensions.mmd"), FIGURE_1_MERMAID)
    
    print()
    
    # Generate Figure 2 (Mermaid)
    print("[3/3] Generating Figure 2: Decision Tree (Mermaid)...")
    write_mermaid_file(os.path.join(output_dir, "Figure_2_DecisionTree.mmd"), FIGURE_2_MERMAID)
    
    print()
    print("=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print()
    print("Instructions:")
    print("  1. Figure_6_CEE.png/pdf - Ready to use in your document")
    print()
    print("  2. For Mermaid diagrams (.mmd files):")
    print("     • Install 'Mermaid Editor' VS Code extension, OR")
    print("     • Visit https://mermaid.live and paste the content")
    print("     • Export as SVG for scalable vector graphics")
    print()
    print("  3. Recommended captions:")
    print("     Figure 1: 'The Four Dimensions of Urban Data. Each dimension")
    print("               directly informs design decisions for multi-sensory display.'")
    print()
    print("     Figure 2: 'The UDCDM Decision Logic. Step 0 (CEE Check) serves as")
    print("               a gatekeeper to prevent cognitive inefficiency.'")
    print()
    print("     Figure 6: 'The Cognitive Efficiency Envelope. The Modality-Load")
    print("               Threshold (β) marks where MR becomes cognitively efficient.'")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    # Get the script's directory and output to figures/ subdirectory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    figures_dir = os.path.join(script_dir, "figures")
    generate_all_figures(figures_dir)
