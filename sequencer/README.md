# Sequencer

A simple Express server that generates and exposes a public key.

### Docker Compose

```bash
$ docker-compose up -d
$ docker-compose logs -f
$ docker-compose down
```

### Docker

```bash
docker build -t sequencer .
docker run -p 4000:4000 -d --name sequencer sequencer
docker logs -f sequencer
docker stop sequencer
docker rm sequencer
```

## API Endpoints

- `GET /` - Returns a simple "sequencer online" message
- `GET /publickey` - Returns the sequencer's public key