# Fixed addresses on Rock it's own network (10.137.42.0/24, see
# docker-compose.yml), which no other Umbrel app can join. Zaino only serves
# wallets on an IP address (not a name), so its address has to be known in
# advance.
export APP_ZECKY_ROCK_IT_ZAKURA_IP="10.137.42.10"
export APP_ZECKY_ROCK_IT_ZAINO_IP="10.137.42.11"
export APP_ZECKY_ROCK_IT_WALLET_PORT="8137"
# The Rock it iPhone app's HTTPS port.
export APP_ZECKY_ROCK_IT_PHONE_PORT="8139"
