FROM node:16.14.0 AS development
ENV NODE_ENV development

WORKDIR /usr/src/app

COPY package.json .

RUN npm install

COPY . .


EXPOSE 3000

CMD [ "node" , "src/server.js"]
