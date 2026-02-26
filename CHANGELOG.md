# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2025-02-26

### Added
- **Moderation:** `!ban`, `!unban`, `!kick`, `!mute`, `!unmute`, `!warn`, `!warnings`, `!clearwarns`
- **Cleanup:** `!purge`, `!purgeuser`
- **Server Management:** `!setlog`, `!serverinfo`, `!userinfo`, `!roles`, `!addrole`, `!removerole`, `!createrole`, `!delrole`
- **Channel Management:** `!createchannel`, `!deletechannel`, `!lockdown`, `!unlock`, `!slowmode`
- **Anti-Raid:** Real-time join flood detection, auto-kick accounts < 7 days old, `!raidstatus`, `!lockserver`, `!unlockserver`
- **Auto-Moderation:** Invite link filter with auto-delete
- **Announcements:** `!announce`, `!dm`, `!poll` (up to 10 options)
- **Voice:** `!voicemute`, `!voiceunmute`, `!vcmove`
- **Audit Logging:** Member leave, ban add/remove, channel create/delete, role create/delete
- **Welcome System:** Automatic DM to new members
- `!help` command with categorized embed
- Full permission checks on every command
- Graceful error handling and unhandled rejection logging

---

_Future releases will be listed here as the project grows._