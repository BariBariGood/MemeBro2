## Face-Swap API Provider Selection

### Context

The project required selecting an image-generation provider capable of inserting a user's face into existing meme templates while preserving the recognizable structure and visual identity of the meme.

Two candidate providers were evaluated:

* GPT Image 1
* Replicate

The evaluation focused on the qualities most important to the MemeBro experience:

* Accuracy of face incorporation into the meme
* Preservation of the original meme template
* Consistency across generations
* Latency
* Cost

The primary success criterion was producing memes where the user's face is clearly and reliably incorporated. While cost and speed are important, they are secondary to generation quality because poor face integration undermines the core purpose of the application.

Each provider was tested through multiple generation runs using the same inputs and similar prompting strategies.

### Decision

Selected GPT Image 1 as the primary image-generation provider for face insertion.

#### Evaluation Results

##### Replicate

**Observations**

* Preserved the original meme template very well.
* Maintained character bodies, props, and scene composition more consistently.
* Struggled to reliably integrate the user's face into the target meme.
* Output quality varied noticeably across runs.
* Face replacement results were inconsistent and sometimes failed to produce a convincing face insertion.

**Performance**

* Approximately 9 seconds faster than GPT Image 1.
* Slightly lower generation cost.
* Roughly $0.02 cheaper per generation than GPT Image 1.

**Quality Assessment**

Strengths:

* Strong template preservation.
* Faster generation times.
* Lower operating cost.

Weaknesses:

* Inconsistent outputs.
* Less reliable face incorporation.
* Greater sensitivity to prompt wording.

##### GPT Image 1

**Observations**

* Consistently incorporated the user's face into meme characters.
* Produced similar results across multiple runs.
* Occasionally modified portions of the original meme template.
* Sometimes altered character features such as hats, clothing, or body shape.
* Minor background modifications were observed but generally preserved the overall scene.

**Performance**

* Higher latency than Replicate.
* Slightly higher generation cost.

**Quality Assessment**

Strengths:

* Strong face incorporation performance.
* Consistent outputs across repeated runs.
* More reliable behavior for the project's primary use case.

Weaknesses:

* Slower generation times.
* Higher operating cost.
* Greater risk of modifying template details.

#### Final Selection

GPT Image 1 was selected as the project's image-generation provider because successful face incorporation is the most important requirement for the application.

Although Replicate preserved meme templates more accurately and operated at a slightly lower cost and latency, its inconsistent face integration reduced confidence that users would receive acceptable results without significant prompt tuning.

GPT Image 1 demonstrated more reliable face insertion and more predictable outputs, making it the better fit for the project's core user experience goals.

### Consequence

The application will use GPT Image 1 for meme face-generation workflows.

Benefits include:

* More reliable face replacement results.
* Greater consistency between generations.
* Reduced prompt-engineering effort.
* Higher confidence that users receive recognizable face-swapped memes.
* Improved overall user satisfaction with generated outputs.

The gateway and generation pipeline can now be standardized around a single provider, simplifying implementation and testing.

Future provider evaluations can continue using the same comparison framework if additional image-generation models become available.

### Trade-Offs/Risks

#### GPT Image 1 Selection

**Advantages**

* Best face incorporation performance.
* Consistent generation quality across runs.
* More predictable output behavior.
* Better alignment with the project's primary objective.

**Risks**

* Higher per-generation cost.
* Longer response times.
* Occasional distortion of meme character details.
* Minor modifications to background or template elements.

#### Replicate Rejection

**Advantages Lost**

* Faster generation speed.
* Lower operating cost.
* Better preservation of original meme templates.

**Reasons Not Selected**

* Face incorporation quality was not sufficiently reliable.
* Outputs varied significantly between runs.
* Additional prompt engineering would likely be required to achieve acceptable consistency.

