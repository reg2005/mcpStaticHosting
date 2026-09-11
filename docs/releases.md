# Local releases

Build and publish locally; this repository does not use GitHub Actions.
Release images target **linux/amd64 (x86-64)**. Run typecheck, lint, unit tests,
dependency audit and Docker integration tests before releasing. Update CHANGELOG,
version references and the Compose image tag together.

```sh
docker login
VERSION=0.2.0
REVISION=$(git rev-parse HEAD)
docker build --platform linux/amd64 \
  --build-arg VERSION="$VERSION" --build-arg REVISION="$REVISION" \
  -t "reg2005/mcp-static-hosting:$VERSION" .
docker build --platform linux/amd64 \
  -t "reg2005/mcp-static-hosting-functions:$VERSION" apps/functions
docker build --platform linux/amd64 -f Dockerfile.edge \
  --build-arg APP_IMAGE="reg2005/mcp-static-hosting:$VERSION" \
  -t "reg2005/mcp-static-hosting-edge:$VERSION" .
docker push "reg2005/mcp-static-hosting-edge:$VERSION"
docker push "reg2005/mcp-static-hosting:$VERSION"
docker push "reg2005/mcp-static-hosting-functions:$VERSION"
docker buildx imagetools inspect "reg2005/mcp-static-hosting:$VERSION"
docker buildx imagetools inspect "reg2005/mcp-static-hosting-functions:$VERSION"
docker buildx imagetools inspect "reg2005/mcp-static-hosting-edge:$VERSION"
```

Never overwrite a released version with different code. Record the registry digests
and use `image: repository@sha256:...` for immutable deployment references. Credentials
are read by Docker from your local credential store, never passed as build arguments.
The source repository and images contain no installation secrets or production data.
Create a Git tag and release notes only after publication and pull verification.
