# Architecture

```mermaid
flowchart LR
  Editor[Rich Editor and Markdown import] --> Actions[Authenticated actions and API]
  Actions --> Guard[Role and course access]
  Guard --> Repository[Transactional repository]
  Repository --> SQLite[Isolated demo SQLite]
  Repository --> PostgreSQL[Shared deployment PostgreSQL]
  Repository --> Loader[Normalized revision loader]
  Loader --> Preview[Editor and authenticated preview]
  Loader --> Public[Public projection]
  Public --> Learner[Studio learner route and API]
  Preview --> Renderer[Shared block renderer]
  Learner --> Renderer
  Renderer --> Worker[Browser Python and R workers]
```

`lib/content.ts` is the shared typed schema. `lib/markdown.ts` implements strict directive parsing and serialization. `lib/repository.ts` writes and hydrates normalized component detail rows and creates immutable publication snapshots. `lib/cms.ts` and `lib/management.ts` authorize course access and structure mutations. `lib/auth.ts` is the replaceable shared identity adapter. `lib/db.ts` selects the database implementation and owns transactions.

Every PostgreSQL transaction holds one pool client until commit/rollback. SQLite serializes operations per connection and uses database write locks. Versioned saves lock the lesson row and compare the expected version. Publication saves the draft and copies metadata, steps, blocks and nested detail rows within that same transaction; subsequent draft changes cannot mutate the published revision. Stable component/choice IDs are distinct from physical revision row IDs.

# Relational schema

```mermaid
erDiagram
  profiles ||--o{ auth_sessions : user_id
  profiles ||--o{ cms_course_staff_assignments : profile_id
  cms_courses ||--o{ cms_course_staff_assignments : course_id
  cms_courses ||--o{ cms_modules : contains
  cms_courses ||--o{ cms_lessons : contains
  cms_modules ||--o{ cms_lessons : groups
  cms_lessons ||--o{ cms_lesson_revisions : versions
  cms_lesson_revisions ||--|| cms_revision_metadata : snapshots
  cms_lesson_revisions ||--o{ cms_lesson_steps : orders
  cms_lesson_steps ||--o{ cms_content_blocks : orders
  cms_content_blocks ||--o| cms_rich_text_blocks : text
  cms_content_blocks ||--o| cms_task_blocks : task
  cms_task_blocks ||--o{ cms_function_references : functions
  cms_content_blocks ||--o| cms_quick_reference_blocks : reference
  cms_content_blocks ||--o| cms_worked_example_blocks : example
  cms_content_blocks ||--o| cms_figure_blocks : figure
  cms_content_blocks ||--o| cms_mcq_blocks : mcq
  cms_mcq_blocks ||--o{ cms_mcq_options : choices
  cms_content_blocks ||--o| cms_code_exercise_blocks : exercise
  cms_content_blocks ||--o| cms_reflection_blocks : reflection
  cms_reflection_blocks ||--o| cms_reflection_rubrics : rubric
  cms_content_blocks ||--o| cms_tutor_config_blocks : tutor
  cms_content_blocks ||--o| cms_data_asset_blocks : resource
  cms_content_blocks ||--o| cms_code_review_blocks : review
```

Each content block has exactly one matching typed detail record in repository writes; loaders report corruption rather than dropping incomplete blocks. Nested function references, options and rubrics use their own tables. JSON is limited to extensible style/randomisation settings and scalar lists in SQLite/text metadata; there is no generic lesson/block JSON payload column. Revision metadata is column-oriented, with source Markdown retained separately for editing. A local `cms_schema_migrations` table and an equivalent PostgreSQL table record migration history.
