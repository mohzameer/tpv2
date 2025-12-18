# AI Agent Integration - Quick Reference

## Quick Start Checklist

### Phase 1: Foundation
- [ ] Add `VITE_ANTHROPIC_API_KEY` to `.env`
- [ ] Install token counter (or use approximation)
- [ ] Build canvas context extractor (Excalidraw elements + notes content)
- [ ] Create notes summarization function (max 500 characters)
- [ ] Create Claude API service
- [ ] Implement context window manager with warnings

### Phase 2: AI Logic
- [ ] Build prompt builder
- [ ] Create response parser
- [ ] Implement intent classifier
- [ ] Build element generator (for Excalidraw)

### Phase 3: Integration
- [ ] Integrate AI into `useChat` hook
- [ ] Connect to Excalidraw canvas in `DrawingPanel`
- [ ] Add UI warnings in `ChatBar`

### Phase 4: Advanced
- [ ] Clarification flow
- [ ] Smart positioning
- [ ] Relationship analysis

### Phase 5: Polish
- [ ] Error handling
- [ ] Performance optimization
- [ ] Testing

---

## Token Limits & Warnings

| Usage | Level | Action |
|-------|-------|--------|
| < 50% | None | Normal operation |
| 50-75% | Info | Show info banner |
| 75-90% | Warning | Auto-truncate, show warning |
| 90%+ | Critical | Prevent send, require action |

**Context Window**: 200,000 tokens (Claude Sonnet 4.5)  
**Reserve**: 20,000 tokens for AI response

---

## Response Types

### ADD Action
```json
{
  "action": "add",
  "elements": [
    { "type": "rectangle", "text": "...", "position": { "x": 100, "y": 200 }, "size": { "width": 150, "height": 80 } },
    { "type": "arrow", "arrowFrom": "element1", "arrowTo": "element2", "arrowLabel": "connects to" },
    { "type": "text", "text": "Label text", "position": { "x": 150, "y": 100 } }
  ],
  "explanation": "..."
}
```

### ANSWER Action
```json
{
  "action": "answer",
  "response": "Natural language explanation..."
}
```

### CLARIFY Action
```json
{
  "action": "clarify",
  "questions": ["Question 1?", "Question 2?"],
  "context": "Context about what's unclear..."
}
```

---

## File Structure

```
src/services/ai/
  ├── claudeService.ts
  ├── tokenCounter.ts
  ├── contextManager.ts
  ├── contextExtractor.ts      # Excalidraw elements → text
  ├── promptBuilder.ts
  ├── responseParser.ts
  ├── intentClassifier.ts
  ├── elementGenerator.ts      # AI responses → Excalidraw elements
  └── truncationStrategy.ts
```

---

## Key Functions

### Token Counting
```typescript
countTokens(text: string): number
estimateTokens(obj: any): number
```

### Context Management
```typescript
getContextWarning(tokenCount: number): ContextWarning | null
truncateContext(context: CanvasContext, maxTokens: number): CanvasContext
extractNotesSummary(blocks: BlockNoteBlocks, maxLength?: number): string
```

### AI Integration
```typescript
generateAIResponse(
  message: string,
  elements: ExcalidrawElement[],
  appState: AppState,
  notesContent: BlockNoteBlocks | string,  // Notes content (max 500 chars summary)
  conversationHistory: Message[]
): Promise<AIResponse>
```

---

## Common Issues & Solutions

**Issue**: Token limit exceeded  
**Solution**: Truncate old messages, summarize distant elements, notes already limited to 500 chars

**Issue**: Invalid element references (for arrows)  
**Solution**: Use label → ID mapping, ask for clarification

**Issue**: Position conflicts  
**Solution**: Auto-adjust positions, use grid layout, check bounding boxes

**Issue**: Ambiguous requests  
**Solution**: Ask clarifying questions, use context

---

## Testing Checklist

- [ ] Empty canvas
- [ ] Single element (each type: rectangle, ellipse, diamond, arrow, line, text)
- [ ] Large canvas (1000+ elements)
- [ ] Arrow bindings (connecting elements)
- [ ] Text elements (standalone and labels)
- [ ] Notes content integration:
  - [ ] Empty notes
  - [ ] Short notes (< 500 chars)
  - [ ] Long notes (> 500 chars, should truncate)
  - [ ] Notes with headings (prioritized in summary)
  - [ ] Notes with markdown (properly converted to plain text)
- [ ] Long conversation
- [ ] Ambiguous requests
- [ ] Network failures
- [ ] Token limit exceeded
- [ ] Invalid AI responses
- [ ] All Excalidraw element types supported
- [ ] AI references notes content in responses when relevant

