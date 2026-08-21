CREATE TABLE IF NOT EXISTS `app_owner_claims` (
  `singletonId` int NOT NULL,
  `userId` int NOT NULL,
  `claimedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`singletonId`)
);
