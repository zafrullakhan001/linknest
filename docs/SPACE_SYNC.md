# Space sync across instances

A space export (version 1.5) records `origin.baseUrl` for the instance that created the file, and each space keeps its id. Importing that file on another instance (for example stage) stores the link. An editor can also set it from the space header (**Source**).

**Sync** pulls the source space and updates title, description, appearance, and the tab / section / link tree, including notes on those links. Items that exist only on this instance stay. Items the source removed are removed here when they were linked to the source.

These stay as they are on this instance:

- space visibility and who it is shared with
- dashboard group and position
- published flag
- message-board messages
- role permissions

The read token is optional. Leave it empty when the source space is public. For a private space, paste an MCP token from the source (Admin → MCP / AI) that can read that space. The token is stored on the server and is not sent back to the browser.

The source address must be `http` or `https`. Loopback and private addresses are refused unless the stage server has `LINKNEST_SYNC_ALLOW_PRIVATE=1` (lab hosts such as another machine on the LAN).

Sync does not run on a schedule. Someone with edit access clicks **Sync**.
