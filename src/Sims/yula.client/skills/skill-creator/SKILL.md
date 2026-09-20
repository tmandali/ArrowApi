---
name: skill-creator
slash: skill-creator
label: Yeni Beceri Tasarımı
description: Kullanıcı iş akışlarını yapılandırılmış yeni bir beceriye (SKILL.md) dönüştürür ve tasarlar
scope: global
---

# Skill Creator

A meta-skill for authoring new agent skills and iteratively refining existing ones.

## 🚀 High-Level Workflow

1. **Capture Intent**:
   - What should this skill enable the agent to do?
   - When should this skill trigger? (specific phrases or workflows)
   - What is the expected output format (table, chart, JSON, file)?
2. **Draft the `SKILL.md`**:
   - YAML frontmatter: `name`, `slash`, `label`, `description`, `scope: global`.
   - Clear markdown instructions with imperative phrasing.
   - Optional Python code snippet (for client-side execution via Pyodide).
3. **Iterate & Verify**:
   - Test the skill against realistic user prompts.
   - Refine edge cases and input validation rules.

## Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, slash, label, description, scope)
│   └── Markdown instructions
```

## Progressive Disclosure Standard

1. **Frontmatter Metadata**: Name, slash, label, and description are kept in index memory.
2. **SKILL.md Body**: Loaded dynamically when triggered (keep under 500 lines).
3. **Draft ➔ Release Lifecycle**:
   - User writes/tests skill locally (saved as `draft` in browser storage).
   - Once tested, user can release it to the database for team-wide use.

## Guidelines for Authoring
- Use imperative, concise steps: "1. Filter rows where amount > 0. 2. Group by store code."
- Avoid vague language: clearly state default values and fallback behaviors.
- Do not hardcode credentials or sensitive tenant identifiers.
