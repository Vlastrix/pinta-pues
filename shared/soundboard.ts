// Agrega un archivo en public/audio/soundboard y su entrada en esta lista.
export const SOUNDBOARD_CLIPS = [
  {
    "id": "aaaaoaaa",
    "name": "aaaaoaaa",
    "file": "aaaaoaaa.mp3"
  },
  {
    "id": "among-us-role-reveal",
    "name": "among us role reveal",
    "file": "among_us_role_reveal.mp3"
  },
  {
    "id": "canon-event-sm",
    "name": "canon event sm",
    "file": "canon_event_sm.mp3"
  },
  {
    "id": "conchetumare",
    "name": "conchetumare",
    "file": "conchetumare.mp3"
  },
  {
    "id": "dead-space-obj-added",
    "name": "dead space obj added",
    "file": "dead_space_obj_added.mp3"
  },
  {
    "id": "dead-space-obj-complete",
    "name": "dead space obj complete",
    "file": "dead_space_obj_complete.mp3"
  },
  {
    "id": "despierta",
    "name": "despierta",
    "file": "despierta.mp3"
  },
  {
    "id": "diamantes-pal-free",
    "name": "diamantes pal free",
    "file": "diamantes_pal_free.mp3"
  },
  {
    "id": "ds-entering-vacuum",
    "name": "ds entering vacuum",
    "file": "ds_entering_vacuum.mp3"
  },
  {
    "id": "ds-zero-gravity",
    "name": "ds zero gravity",
    "file": "ds_zero_gravity.mp3"
  },
  {
    "id": "el-pepe",
    "name": "el pepe",
    "file": "el_pepe.mp3"
  },
  {
    "id": "ey-ey-ey-peque",
    "name": "ey ey ey peque",
    "file": "ey_ey_ey_peque.mp3"
  },
  {
    "id": "fornite",
    "name": "fornite",
    "file": "fornite.mp3"
  },
  {
    "id": "gemi2",
    "name": "gemi2",
    "file": "gemi2.mp3"
  },
  {
    "id": "me-hace-frio",
    "name": "me hace frio",
    "file": "me_hace_frio.mp3"
  },
  {
    "id": "no-tienes-enemigos",
    "name": "no tienes enemigos",
    "file": "no_tienes_enemigos.mp3"
  },
  {
    "id": "old-hardware",
    "name": "old hardware",
    "file": "old_hardware.mp3"
  },
  {
    "id": "omg",
    "name": "omg",
    "file": "omg.mp3"
  },
  {
    "id": "papu-papu",
    "name": "papu papu",
    "file": "papu_papu.mp3"
  },
  {
    "id": "que-pro",
    "name": "que pro",
    "file": "que_pro.mp3"
  },
  {
    "id": "unitel",
    "name": "unitel",
    "file": "unitel.mp3"
  },
  {
    "id": "uwu",
    "name": "uwu",
    "file": "uwu.mp3"
  },
  {
    "id": "vieja-de-m",
    "name": "vieja de m",
    "file": "vieja_de_m.mp3"
  },
  {
    "id": "yametekudasai",
    "name": "yametekudasai",
    "file": "yametekudasai.mp3"
  }
] as const;

export type SoundboardId = typeof SOUNDBOARD_CLIPS[number]['id'];
export type SoundboardEvent = { code: string; id: SoundboardId; senderId: string; name: string };
