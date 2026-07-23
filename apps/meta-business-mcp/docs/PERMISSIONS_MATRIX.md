# Permissions Matrix

Capability names in this document are internal product capabilities. Exact Meta permissions will be mapped and verified against current official documentation during the provider-integration milestone.

| Tool | Mode | Risk | Default approval | Required internal capabilities | Data class |
|---|---|---:|---|---|---|
| `meta_page_get` | Read | R0 | None | `pages.read` | Business public |
| `meta_page_list_posts` | Read | R0 | None | `content.read` | Business public |
| `meta_post_get` | Read | R0 | None | `content.read` | Business public |
| `meta_post_list_comments` | Read | R0 | None | `comments.read` | Personal data |
| `meta_inbox_list_threads` | Read | R0 | None | `messages.read` | Personal data |
| `meta_inbox_get_thread` | Read | R0 | None | `messages.read` | Personal data |
| `meta_page_get_insights` | Read | R0 | None | `insights.read` | Business internal |
| `meta_webhook_health` | Read | R0 | None | `webhooks.health` | Business internal |
| `meta_post_create_draft` | Draft | R0 | None | `content.draft` | Business internal |
| `meta_comment_create_reply_draft` | Draft | R0 | None | `comments.read`, `content.draft` | Personal data |
| `meta_message_create_reply_draft` | Draft | R0 | None | `messages.read`, `content.draft` | Personal data |
| `meta_content_create_weekly_plan` | Draft | R0 | None | `content.draft` | Business internal |
| `meta_post_publish` | Write | R2 | Single | `content.publish` | Business public |
| `meta_post_schedule` | Write | R2 | Single | `content.publish` | Business public |
| `meta_comment_reply` | Write | R2 | Single | `comments.manage` | Personal data |
| `meta_message_send` | Write | R2 | Single | `messages.send` | Personal data |
| `meta_post_delete` | Write | R3 | Dual | `content.delete` | Business public |

## Staff roles

| Role | Read | Create drafts | Approve R2 | Approve R3 | Manage connector or kill switch |
|---|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes, not own request | Yes |
| Admin | Yes | Yes | Yes | Yes, not own request | Yes |
| Operator | Yes | Yes | Yes | Yes when assigned and not requester | No |
| Member | Allowed workflows only | Yes | No | No | No |
| Viewer/Auditor | Yes | No | No | No | No |

Every Page operation also requires exact Page allowlisting. Provider permissions alone never authorize an action.
