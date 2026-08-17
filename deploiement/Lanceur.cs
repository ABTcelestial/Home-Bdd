// ---------------------------------------------------------------------------
//  Celestial Hub - lanceur du paquet portable.
//
//  Compile en "Celestial Hub.exe" avec le logo en icone (voir portable.mjs).
//  Son travail : rendre le Hub utilisable sur un PC ou rien n'est installe.
//
//    - premier demarrage : demande le mot de passe et l'ecrit dans .env ;
//    - cree le dossier partage a cote de l'executable ;
//    - lance le node embarque, affiche les adresses a taper sur le telephone,
//      et ouvre le navigateur.
//
//  Aucune dependance : ni Node, ni .NET moderne, ni droits administrateur.
// ---------------------------------------------------------------------------
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

class Lanceur
{
    static string Dossier;

    static int Main(string[] args)
    {
        Console.Title = "Celestial Hub";
        Dossier = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

        string node = Path.Combine(Dossier, @"runtime\node.exe");
        string app = Path.Combine(Dossier, "app");
        string serveur = Path.Combine(app, "server.js");

        if (!File.Exists(node) || !File.Exists(serveur))
        {
            Erreur("Paquet incomplet : runtime\\node.exe ou app\\server.js est absent.\n"
                 + "Decompressez l'archive en entier avant de lancer le Hub.");
            return 1;
        }

        string racine = Path.Combine(Dossier, "Fichiers");
        Directory.CreateDirectory(racine);

        string env = Path.Combine(app, ".env");
        if (!File.Exists(env) && !PremierDemarrage(env, racine)) return 1;

        int port = PortLibre(3000);

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("\n  Celestial Hub");
        Console.ResetColor();
        Console.WriteLine("  Dossier partage : " + racine);
        Console.WriteLine("\n  Sur ce PC        : http://localhost:" + port);
        foreach (string ip in AdressesLocales())
            Console.WriteLine("  Sur le reseau    : http://" + ip + ":" + port);
        Console.WriteLine("\n  Laissez cette fenetre ouverte. Fermez-la pour arreter le Hub.\n");

        var psi = new ProcessStartInfo(node, "server.js")
        {
            WorkingDirectory = app,
            UseShellExecute = false,
        };
        psi.EnvironmentVariables["NODE_ENV"] = "production";
        psi.EnvironmentVariables["HUB_ROOT"] = racine;
        psi.EnvironmentVariables["HUB_DATA_DIR"] = Path.Combine(Dossier, "config");
        psi.EnvironmentVariables["PORT"] = port.ToString();

        try
        {
            var p = Process.Start(psi);
            // Laisse au serveur le temps de se preparer avant d'ouvrir le navigateur.
            System.Threading.Thread.Sleep(4000);
            try { Process.Start("http://localhost:" + port); } catch { }
            p.WaitForExit();
            return p.ExitCode;
        }
        catch (Exception ex)
        {
            Erreur("Impossible de demarrer le serveur :\n" + ex.Message);
            return 1;
        }
    }

    // Premier demarrage : un mot de passe est indispensable, sinon le Hub
    // refuserait toute connexion. On l'ecrit a cote de l'app, jamais dans le
    // dossier partage.
    static bool PremierDemarrage(string env, string racine)
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("\n  Premier demarrage du Celestial Hub");
        Console.ResetColor();
        Console.WriteLine("\n  Choisissez le mot de passe qui protegera ce Hub.");
        Console.WriteLine("  Tout le monde sur le reseau pourra lire, envoyer ET supprimer");
        Console.WriteLine("  les fichiers de : " + racine + "\n");

        string mdp = "";
        while (mdp.Length < 4)
        {
            Console.Write("  Mot de passe (4 caracteres minimum) : ");
            mdp = LireMasque();
            if (mdp.Length < 4) Console.WriteLine("  Trop court.\n");
        }

        try
        {
            File.WriteAllText(env, "HUB_PASSWORD=" + mdp + "\n", new UTF8Encoding(false));
            Console.WriteLine("\n  Mot de passe enregistre. Il ne sera plus demande.\n");
            return true;
        }
        catch (Exception ex)
        {
            Erreur("Impossible d'ecrire la configuration :\n" + ex.Message);
            return false;
        }
    }

    static string LireMasque()
    {
        // Entree redirigee (script, tube, tache planifiee) : ReadKey n'existe
        // pas dans ce cas et levait une exception en pleine figure. On lit
        // simplement la ligne, sans masquage possible.
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";

        var sb = new StringBuilder();
        while (true)
        {
            var k = Console.ReadKey(true);
            if (k.Key == ConsoleKey.Enter) { Console.WriteLine(); return sb.ToString(); }
            if (k.Key == ConsoleKey.Backspace) { if (sb.Length > 0) { sb.Length--; Console.Write("\b \b"); } continue; }
            if (char.IsControl(k.KeyChar)) continue;
            sb.Append(k.KeyChar);
            Console.Write("*");
        }
    }

    // 3000 est peut-etre deja pris par un autre Hub ou une autre app.
    static int PortLibre(int depart)
    {
        for (int p = depart; p < depart + 20; p++)
        {
            try
            {
                var l = new TcpListener(IPAddress.Any, p);
                l.Start();
                l.Stop();
                return p;
            }
            catch (SocketException) { }
        }
        return depart;
    }

    static string[] AdressesLocales()
    {
        var sortie = new System.Collections.Generic.List<string>();
        try
        {
            foreach (var ip in Dns.GetHostEntry(Dns.GetHostName()).AddressList)
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    sortie.Add(ip.ToString());
        }
        catch { }
        return sortie.ToArray();
    }

    static void Erreur(string message)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine("\n  " + message + "\n");
        Console.ResetColor();
        Console.WriteLine("  Appuyez sur une touche pour fermer.");
        Console.ReadKey(true);
    }
}
