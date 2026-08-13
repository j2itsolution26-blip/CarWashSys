# Login background photo

The sign-in screen looks for **`login-bg.jpg`** in this folder.

```
public/images/login-bg.jpg
```

## Behaviour

| State | Result |
|---|---|
| File present | The photo becomes the backdrop, graded to navy and vignetted so the login card stays readable. |
| File missing | The illustrated wash bays render instead. **Nothing breaks** — it is applied as a CSS background, so a missing file degrades gracefully rather than showing a broken image. |

Which mode is active is controlled by `PHOTO_BACKDROP` at the top of
`src/components/login/login-scene.tsx`. Set it to `null` to force the
illustrated scene back on even when a photo exists.

When a photo is set, the illustrated cars, washers and the CAR WASH /
MOTORCYCLE WASH signage are withdrawn — a photograph is one scene, and
captioning half of it "MOTORCYCLE WASH" would describe something that is not in
the picture.

## Preparing the file

The backdrop is full-bleed behind a centred card, so the interesting part of the
image should sit toward the **edges**: the middle third is deliberately darkened
and will be covered by the login card.

Recommended:

- **Dimensions** — 2400 × 1600 or larger, landscape.
- **Format** — JPEG at quality 75–80, or WebP. Both are fine; the file is served
  directly, so the format you save is the format that ships.
- **Size** — aim for **under 400 KB**. This image is on the critical path of the
  screen every member of staff sees first, and the login form must become
  interactive immediately.

To compress without extra tooling:

```bash
# ImageMagick
magick input.jpg -resize 2400x -quality 78 -strip login-bg.jpg

# or squoosh.app in a browser — no install required
```

Check the result:

```bash
ls -lh public/images/login-bg.jpg
```

If the file lands much above 400 KB, lower the quality before raising the
dimensions — quality 70 on a dark, heavily-graded background is essentially
indistinguishable once the navy overlay is applied.
