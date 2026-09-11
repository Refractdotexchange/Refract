# Music credits

Most cues in `public/music` are original, synthesised by `music/compose.mjs`.
Nothing in those is sampled or licensed, so they carry no obligations.

Where a supplied track is used instead, it is listed here. These files are
**gitignored on purpose**: the licences cover using a track in a video, not
redistributing the audio itself, so the repo carries the credit and not the
file.

## ShieldedFlow — `refract-shielded-flow-track.wav`

> "Cinematic Action Teaser NoCopyright Background Music / Rush"
> by **ArcticFoxMusic — No Copyright Music** (2024)

Source: https://www.youtube.com/watch?v=-9D3b3G-2YQ

"No Copyright" is the channel's name, not the licence. The artist retains
copyright and grants use subject to their terms, which require a credit
wherever the video is published. **Put the line above in the description of
any post carrying this film**, and check the artist's own terms before using
it in anything paid or sponsored.

Processing applied: trimmed to 27.13s, 1.4s fade under the end card, and
normalised to -15 LUFS to match the generated cues.

The generated score for this film still exists and is rebuilt with
`node music/compose.mjs shielded-flow`. Switching back is one filename in
`src/films/ShieldedFlow.tsx`.
