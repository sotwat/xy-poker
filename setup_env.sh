#!/bin/zsh

# Ensure local bin is in PATH
export PATH="$HOME/.local/bin:$PATH"

# Check if fnm is available
if ! command -v fnm &> /dev/null; then
  echo "fnm not found. Downloading..."
  mkdir -p ~/.local/bin
  curl -Lo fnm.zip https://github.com/Schniz/fnm/releases/latest/download/fnm-macos.zip
  unzip -o fnm.zip -d ~/.local/bin
  chmod +x ~/.local/bin/fnm
  rm fnm.zip
fi

# Ensure fnm configuration is in ~/.zshrc
grep -q 'eval "$(fnm env --use-on-cd)"' ~/.zshrc || echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc

# Load fnm for this script execution
eval "$(fnm env --use-on-cd)"

# Install Node.js LTS
echo "Installing Node.js LTS..."
fnm install --lts
fnm default lts

# Setup current session Node path again to be safe
eval "$(fnm env --use-on-cd)"

# Verify node command
if command -v node &> /dev/null; then
  echo "Node.js installed successfully: $(node -v)"
else
  echo "Failed to install Node.js."
  exit 1
fi

# Run `npm install` in the project root and inside the `server/` directory
echo "Installing npm dependencies in project root..."
npm install
echo "Installing npm dependencies in server directory..."
(cd server && npm install)

# Set Git global configurations
echo "Configuring Git..."
git config --global user.name "watanabesotaro"
git config --global user.email "watanabe.sotaro310@gmail.com"

# Check if ~/.ssh/id_ed25519 exists. If not, generate a new SSH key
if [ ! -f ~/.ssh/id_ed25519 ]; then
  echo "Generating new SSH key..."
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
  echo "Add the following public key to your GitHub account:"
  cat ~/.ssh/id_ed25519.pub
else
  echo "SSH key already exists."
fi

echo "Setup complete."
