# Face-swap API provider ADR
Goal: Compare between ~~RunwayML~~ GPT img 1 and Replicate. Measure latency, cost, and quality to determine a model to use in project for incorportaing face into meme.   

Comparing between **Replicate** + **GPT img 1**
## Deciding between API - Issue #28  
### **Task**
For each API:
- Record model
- Record latency
- Record cost
- Record observations / quality
- Make final decision based on pros + cons
- Atleast 3 trial runs per API
  
### **Replicate**:
- Did a really good job at preserving the meme template but has a lot of trouble incorporating the face into the meme. 
- Costs slightly less (by 0.02$) than other model. 
- Is ~9 seconds faster than GPTimg1
- Face incorportaion issues may be resolved using better prompts but my 1 test result didn't go that great. 
- The test output images were not consistent across all 3 runs but may be due once again to prompting

### **GPT Image 1**:
- Had the opposite problem, model did well at incorportaing the face into meme 
- Often distorted the meme character's body or removed the hat etc. 
- Background was slightly modified but generally very similar so not too bad.
- Cost is slightly more than Replicate. 
- Tests were pretty consistent throughout.

## Reasoning / **Overall**: 
Pick goes to **GPTimg1**, although it costs a little more, is slowly slower, and the meme template is slightly changed, the tradeoff feels worth to incorportate the face better (extra important) along with greater consistency across runs.