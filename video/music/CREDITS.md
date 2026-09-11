# Music credits

Most cues in `public/music` are original, synthesised by `music/compose.mjs`.
Nothing in those is sampled or licensed, so they carry no obligations.

Where a supplied track is used instead, it is listed below. Those files are
**gitignored on purpose**: the licences cover using a track in a video, not
redistributing the audio itself, so the repo carries the credit and not the
file.

"No Copyright" is the name these channels trade under, not the licence. The
artists retain copyright and grant use subject to their own terms, which
require a credit wherever the video is published. **The credit line for a film
goes in the description of any post carrying it.** Check the artist's terms
before using one in anything paid or sponsored.

---

## ShieldedFlow — `refract-shielded-flow-track.wav`

> Music: "Rush" by ArcticFoxMusic — No Copyright Music

Source: https://www.youtube.com/watch?v=-9D3b3G-2YQ
Trimmed to 27.13s, 1.4s fade under the end card, normalised to -15 LUFS.

## PrivateSwap and MainnetLive

`refract-private-swap-track.wav`, `refract-mainnet-live-track.wav`

> Music: "Invasion" by Soundridemusic — No Copyright Music

Both films use the same track and both need this credit in the description.
PrivateSwap is trimmed to 23.87s, MainnetLive to 27.00s, each faded under its
end card and normalised to -15 LUFS.

MainnetLive was retimed to fit the music rather than the other way round. Its
first cut landed the four features on the track's one deep break, so the
biggest moment in the picture sat under the quietest moment in the score.
Run from its start rather than offset: its opening hit lands on the token
being chosen, its 13s hit on the pool executing, and its climax on the end
card.

---

Both films also have an original generated score, still built by
`node music/compose.mjs shielded-flow` and `node music/compose.mjs
private-swap`. Switching back to one is a single filename in the film.
