# EmergentRPG

A fresh Unity and Blender workspace for an emergent RPG. This repository starts with a blank Universal Render Pipeline project; no gameplay systems have been carried over.

## Tools

- Unity **6000.6.2f1**, as recorded in `UnityProject/ProjectSettings/ProjectVersion.txt`.
- Blender **5.2 LTS** for source artwork.
- Git and Git LFS for source control and binary assets.
- VS Code with Microsoft's Unity extension for C# development.
- Unity CLI **1.0.0-beta.10** for local project and editor automation.

## Open the project

Clone the repository, run `git lfs install` and `git lfs pull`, then add the **UnityProject** directory in Unity Hub. Open it with the version recorded above and let packages import.

The CLI can also open it from the repository root:

```powershell
unity open ./UnityProject
```

Open `Assets/Scenes/SampleScene.unity` for the empty starting scene.

## Layout

| Path | Purpose |
| --- | --- |
| `UnityProject/Assets` | Runtime assets, scenes, and future game code |
| `UnityProject/Packages` | Pinned Unity package dependencies |
| `UnityProject/ProjectSettings` | Shared editor and build settings |
| `ArtSource` | Editable Blender source files, outside Unity's asset import |

Keep `Library`, `Temp`, builds, logs, editor preferences, and installed tools out of Git. Commit Unity `.meta` files alongside their assets. Binary artwork uses Git LFS.

## Blender to Unity

Start from `ArtSource/Starter.blend`, an empty scene with metric units and one Blender unit per meter. Save editable source art in `ArtSource`. Export models as FBX into `UnityProject/Assets/Art/Models`, with **Selected Objects**, **-Z Forward**, and **Y Up**. Apply object rotation and scale before export. Check the imported size against a one-meter Unity cube.

Keep `.blend` sources outside `Assets` so opening the Unity project does not require an automatic Blender conversion.

## Local automation

The [Unity CLI](https://docs.unity.com/en-us/unity-cli/use-unity-cli) manages editors and projects. The [Unity Pipeline package](https://docs.unity.com/en-us/unity-production-pipeline/local-tools-cli/unity-pipeline-package) **0.7.0-exp.1** is included in the project and enables commands against an open Editor. It is experimental.

From the repository root:

```powershell
unity --version
unity editors -i
unity auth login
unity pipeline install --project-path ./UnityProject
unity pipeline list
unity command --project-path ./UnityProject
```

Authentication is local to each developer's machine. Never commit tokens, credentials, or license files.

## Validate a Windows build

```powershell
unity build ./UnityProject --target StandaloneWindows64 --output-path ./UnityProject/Builds/Windows/EmergentRPG.exe --no-tail
```

The initial project was verified with a clean batch import, a successful Windows player build, and a Blender starter-file load. There are no gameplay systems or automated gameplay tests yet.
