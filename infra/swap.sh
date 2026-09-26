#!/usr/bin/env bash
# 2 GB de swap: la VM gratis E2.1.Micro solo tiene 1 GB de RAM y n8n la agradece.
set -e
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
