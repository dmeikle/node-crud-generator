# CRUD Generator

This project provides a script to generate CRUD classes and Prisma models from a given SQL script. 
The generated files include DTOs, handlers, controllers, DB services, responses, exceptions, and constants.
The files are constructed to work in conjunction with the [NestJS](https://nestjs.com/) framework and
the https://github.com/dmeikle/node-mvc project.

## Prerequisites

- Node.js
- npm

## Installation

1. Clone the repository:
    ```sh
    git clone git@github.com:dmeikle/node-crud-generator.git
    cd node-crud-generator
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```
   
3. set the generate-crud.js for execution
   ```sh
    chmod +x generate-crud.js
    ```

## Usage

To generate the CRUD classes and Prisma model:

1. Create a SQL script that contains the table definitions for the database schema.
```shell
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ;
```
run the following command:

```sh
./generate-crud.js 
```