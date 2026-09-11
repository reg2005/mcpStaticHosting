# Releases

Run CI, review the production dependency audit and inspect container vulnerability
scan results before release. Add CHANGELOG notes, update the version/default image
tag together, and create a `vX.Y.Z` Git tag and GitHub release after validation.
Do not overwrite a published version tag with different code. Prefer image digests
or the full commit SHA tag for installations requiring immutable references.

## GitHub Actions publication

The **Publish Docker Hub images** workflow is manual and first runs CI. Configure:

- Repository/environment variable `DOCKERHUB_USERNAME`.
- Environment `dockerhub` secret `DOCKERHUB_TOKEN` with write access to the two images.

Create those credentials yourself in Docker Hub; never commit or put them in build
arguments. The workflow targets `linux/amd64` and `linux/arm64`, publishes version and
full-SHA tags, and requests provenance/SBOM attestations. Architecture support is only
confirmed after that build succeeds. Consider an environment approval rule for releases.

## Local publication

After `docker login`, use Docker Buildx to build and push the two Dockerfiles for the
required platforms. Pass `VERSION` and `REVISION` build arguments to the main image.
These contain public release metadata, never credentials. Inspect the remote manifests
with `docker buildx imagetools inspect` and test a pull from a clean environment.

Use the README as Docker Hub's long description; its GitHub links point to detailed
setup and operations guides. Publish release notes with tested platforms and any
known limitations. This repository does not silently create publishing credentials.
