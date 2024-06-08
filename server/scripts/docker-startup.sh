#!/bin/bash
###
# Docker startup script
### 
cd /usr/src/app/server/
if [ ! -f ./config/nodeunifi.db ]; then
    npm run db
fi

npm run start
