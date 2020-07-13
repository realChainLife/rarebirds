#!/bin/bash
echo "Building and Starting RareBirds"

COMPOSE="docker-compose -f docker-compose/local/master-node.yml -p trubudget"

$COMPOSE down
$COMPOSE build --pull
$COMPOSE up
