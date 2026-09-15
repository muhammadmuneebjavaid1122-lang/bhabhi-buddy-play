# Online Bhabhi multiplayer

## What will change
- Add an animated **IBRA.INC** opening mark before the game appears, with a reduced-motion fallback.
- Add player accounts, then offer **Play with friends**, **Find a table**, and **Practice with bots**.
- Friends can create a private table and share a short room code; worldwide matchmaking fills public four-player tables.
- Keep the existing full Bhabhi rules, but make the online game state authoritative and synchronized for all four players.
- Sync quick chat and reactions between players while keeping each hand private.
- Remove the Table log panel so hidden play history cannot be used as an advantage.
- Expand Thulla feedback with a table shake, card-pickup sweep, spotlight, impact banner, and stronger sound.

## Online flow
```text
Animated IBRA.INC intro
        |
Sign in / Practice with bots
        |
Friends (create or join code)  |  Worldwide matchmaking
        |                                  |
                 Four-seat waiting room
                          |
                  Live synchronized game
```

## Technical details
- Use Lovable Cloud for accounts, private room membership, matchmaking, live room signals, and chat/reactions.
- Store the complete deck and hands in a server-only game-state table; players receive only their own hand plus public table information.
- Validate every card play on the server with the existing Bhabhi rule engine and version checks to prevent stale or duplicate moves.
- Use live subscriptions only as refresh signals, avoiding accidental exposure of opponents’ cards.
- Add secure access rules so only room members can view a room and only the server can read or change full game state.
